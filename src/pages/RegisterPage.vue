<script setup>
// src/pages/RegisterPage.vue
//
// Само-регистрация и выбор специализаций (Фаза 10, задача 10.5).
//
// Раньше публичным маршрутом был только `/login`, а серверная регистрация
// создавала лишь `users` — без специализации. Теперь пользователь выбирает
// 1..N ниш, а после регистрации мы материализуем пресеты (10.4): новый юзер
// сразу видит готовый каталог своей специализации.
//
// Специализации приходят из ответа `/register` (их создаёт сервер). Если сервер
// их не вернул (старая версия) — создаём локально и отдаём синку.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { PRESETS } from 'src/domain/presets/index.js'
import { serializeFeatures } from 'src/domain/features.js'
import syncService from 'src/services/syncService.js'
import { logger } from 'src/utils/logger'
// Общий каркас экранов входа/регистрации (переработка интерфейса).
import AuthShell from 'src/components/ui/AuthShell.vue'

const auth = useAuthStore()
const specializationsStore = useSpecializationsStore()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const selectedPresets = ref([])
const presetError = ref('')
const submitting = ref(false)
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false)

const presetOptions = computed(() =>
  PRESETS.map(preset => ({ label: preset.label, value: preset.key, icon: preset.icon }))
)

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
      online.value = true
    })
    window.addEventListener('offline', () => {
      online.value = false
    })
  }

  if (auth.isAuthenticated && auth.unlocked) {
    router.replace('/orders')
  }
})

/** Определения специализаций по выбранным пресетам (для запроса и локального фолбэка). */
function presetDefinitions() {
  return selectedPresets.value.map(key => {
    const preset = PRESETS.find(item => item.key === key)
    return {
      name: preset.label,
      preset_key: preset.key,
      accent: preset.accent,
      features: serializeFeatures(preset.features),
      template_version: preset.version ?? null,
    }
  })
}

async function submit() {
  presetError.value = ''

  if (!selectedPresets.value.length) {
    presetError.value = 'Выберите хотя бы одну специализацию'
    return
  }

  submitting.value = true

  try {
    const defs = presetDefinitions()

    const data = await auth.register({
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
      passwordConfirmation: passwordConfirm.value,
      // Сервер создаёт специализации вместе с пользователем (10.5).
      specializations: defs.map(def => ({ name: def.name, preset_key: def.preset_key })),
    })

    const records = Array.isArray(data?.specializations) ? data.specializations : []

    const localIds = records.length
      ? await specializationsStore.onboardFromServer(records)
      : await specializationsStore.onboardLocal(defs)

    // Материализуем каталог каждого выбранного пресета (идемпотентно).
    for (let index = 0; index < localIds.length; index += 1) {
      const presetKey = records[index]?.preset_key || defs[index]?.preset_key
      if (presetKey) {
        await specializationsStore.applyPreset(localIds[index], presetKey)
      }
    }

    // Догоняем очередь в фоне: каталог онбординга уходит батчем.
    syncService
      .sync({ force: true })
      .catch(err => logger.warn('[Register] Синк после регистрации не удался:', err?.message))

    await router.replace('/orders')
  } catch {
    // Текст ошибки уже в `auth.error` — его показывает баннер.
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Регистрация"
    subtitle="Выберите специализации — каталог ниши появится сразу"
  >
    <q-banner v-if="!online" dense class="bg-orange-9 text-white q-mb-md">
      Нет интернета. Для регистрации нужна сеть — дальше приложение работает офлайн.
    </q-banner>

    <q-banner v-if="auth.error" dense class="bg-negative text-white q-mb-md">
      {{ auth.error }}
    </q-banner>

    <q-banner v-if="presetError" dense class="bg-negative text-white q-mb-md">
      {{ presetError }}
    </q-banner>

    <q-form class="q-gutter-y-md" @submit="submit">
      <q-input
        v-model="name"
        label="Имя"
        outlined
        dense
        autocomplete="name"
        :rules="[value => Boolean(value) || 'Укажите имя']"
      />

      <q-input
        v-model="email"
        type="email"
        label="Email"
        outlined
        dense
        autocomplete="username"
        :rules="[value => Boolean(value) || 'Укажите email']"
      />

      <q-input
        v-model="password"
        type="password"
        label="Пароль"
        outlined
        dense
        autocomplete="new-password"
        :rules="[
          value => Boolean(value) || 'Укажите пароль',
          value => String(value).length >= 6 || 'Минимум 6 символов',
        ]"
      />

      <q-input
        v-model="passwordConfirm"
        type="password"
        label="Повторите пароль"
        outlined
        dense
        autocomplete="new-password"
        :rules="[
          value => Boolean(value) || 'Повторите пароль',
          value => value === password || 'Пароли не совпадают',
        ]"
      />

      <q-select
        v-model="selectedPresets"
        :options="presetOptions"
        option-value="value"
        option-label="label"
        emit-value
        map-options
        multiple
        use-chips
        label="Специализации"
        outlined
        dense
        color="secondary"
        :rules="[value => (value && value.length) || 'Выберите хотя бы одну специализацию']"
        hint="Можно выбрать несколько — например «веломастер + аквариумист»"
      />

      <q-btn
        type="submit"
        color="secondary"
        text-color="black"
        no-caps
        label="Создать аккаунт"
        class="full-width"
        :loading="submitting || auth.loading"
      />
    </q-form>

    <q-btn
      flat
      no-caps
      color="grey-6"
      label="Уже есть аккаунт? Войти"
      class="full-width q-mt-sm"
      @click="router.push('/login')"
    />
  </AuthShell>
</template>
