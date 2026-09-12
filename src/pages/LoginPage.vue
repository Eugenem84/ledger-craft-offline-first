<script setup>
// src/pages/LoginPage.vue
//
// Вход в приложение (задача 7.4). Экран совмещает три режима:
//   • вход — email/пароль → серверный токен Sanctum (без него синк отвечает 401);
//   • разблокировка — PIN-код, если приложение заперто (токен уже есть);
//   • установка PIN — предлагается сразу после первого входа (можно пропустить).
//
// Первый вход требует сети (токен выдаёт сервер). Дальше приложение работает
// офлайн: PIN проверяется локально по хешу.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import syncService from 'src/services/syncService.js'
import { logger } from 'src/utils/logger'
// Общий каркас экранов входа/регистрации (переработка интерфейса).
import AuthShell from 'src/components/ui/AuthShell.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const pin = ref('')
const pinConfirm = ref('')
const pinError = ref('')
const offerPin = ref(false)
const submitting = ref(false)
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine !== false)

const mode = computed(() => {
  if (auth.isLocked) return 'unlock'
  if (offerPin.value && auth.isAuthenticated && !auth.hasPin) return 'set-pin'
  return 'login'
})

const title = computed(() => {
  if (mode.value === 'unlock') return 'Приложение заперто'
  if (mode.value === 'set-pin') return 'Защитите приложение'
  return 'Вход в приложение'
})

const subtitle = computed(() => {
  if (mode.value === 'unlock') return 'Введите PIN-код'
  if (mode.value === 'set-pin') return 'PIN-код спрашивается при каждом запуске'
  return 'Учёт работ и запчастей — офлайн, с синхронизацией'
})

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
      online.value = true
    })
    window.addEventListener('offline', () => {
      online.value = false
    })
  }

  // Уже вошли и приложение открыто — экран входа не нужен.
  if (auth.isAuthenticated && auth.unlocked) {
    goNext()
  }
})

/** Возврат туда, куда шёл пользователь (guard положил путь в `redirect`). */
function goNext() {
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/orders'
  router.replace(target)
}

/** После успешного входа/разблокировки: дожимаем очередь и предлагаем PIN. */
async function afterAuth() {
  syncService
    .sync({ force: true })
    .catch(err => logger.warn('[Auth] Синк после входа не удался:', err?.message))

  if (auth.hasPin) {
    goNext()
    return
  }

  pin.value = ''
  offerPin.value = true
}

async function submitLogin() {
  pinError.value = ''
  submitting.value = true

  try {
    await auth.login(email.value.trim(), password.value)
    await afterAuth()
  } catch {
    // Текст ошибки уже в `auth.error` — его показывает баннер.
  } finally {
    submitting.value = false
  }
}

async function submitUnlock() {
  pinError.value = ''
  submitting.value = true

  try {
    const ok = await auth.verifyPin(pin.value)

    if (!ok) {
      pin.value = ''
      return
    }

    await afterAuth()
  } finally {
    submitting.value = false
  }
}

async function savePin() {
  pinError.value = ''

  if (!/^\d{4,8}$/.test(pin.value)) {
    pinError.value = 'PIN — от 4 до 8 цифр'
    return
  }

  if (pin.value !== pinConfirm.value) {
    pinError.value = 'PIN-коды не совпадают'
    return
  }

  submitting.value = true

  try {
    await auth.setPin(pin.value)
    goNext()
  } finally {
    submitting.value = false
  }
}

function skipPin() {
  goNext()
}

async function signOut() {
  await auth.logout()
  pin.value = ''
  offerPin.value = false
}
</script>

<template>
  <AuthShell :title="title" :subtitle="subtitle">
    <q-banner v-if="!online && mode === 'login'" dense class="bg-orange-9 text-white q-mb-md">
      Нет интернета. Для первого входа нужна сеть — дальше приложение работает офлайн по PIN.
    </q-banner>

    <q-banner v-if="auth.error" dense class="bg-negative text-white q-mb-md">
      {{ auth.error }}
    </q-banner>

    <q-banner v-if="pinError" dense class="bg-negative text-white q-mb-md">
      {{ pinError }}
    </q-banner>

    <q-form v-if="mode === 'login'" class="q-gutter-y-md" @submit="submitLogin">
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
        autocomplete="current-password"
        :rules="[value => Boolean(value) || 'Укажите пароль']"
      />

      <q-btn
        type="submit"
        color="secondary"
        text-color="black"
        no-caps
        label="Войти"
        class="full-width"
        :loading="submitting || auth.loading"
      />

      <!-- Само-регистрация (Фаза 10, задача 10.5): раньше экрана регистрации не было. -->
      <q-btn
        type="button"
        flat
        no-caps
        color="grey-6"
        label="Нет аккаунта? Зарегистрироваться"
        class="full-width"
        @click="router.push('/register')"
      />
    </q-form>

    <q-form v-else-if="mode === 'unlock'" class="q-gutter-y-md" @submit="submitUnlock">
      <q-input
        v-model="pin"
        type="password"
        inputmode="numeric"
        maxlength="8"
        label="PIN-код"
        outlined
        dense
        autofocus
      />

      <q-btn
        type="submit"
        color="secondary"
        text-color="black"
        no-caps
        label="Разблокировать"
        class="full-width"
        :loading="submitting"
      />

      <q-btn flat no-caps color="grey-6" label="Выйти из аккаунта" @click="signOut" />
    </q-form>

    <q-form v-else class="q-gutter-y-md" @submit="savePin">
      <div class="text-caption lc-mute">
        PIN защищает приложение от чужого взгляда. Его можно пропустить — тогда приложение
        будет открываться без замка.
      </div>

      <q-input
        v-model="pin"
        type="password"
        inputmode="numeric"
        maxlength="8"
        label="PIN (4–8 цифр)"
        outlined
        dense
      />

      <q-input
        v-model="pinConfirm"
        type="password"
        inputmode="numeric"
        maxlength="8"
        label="Повторите PIN"
        outlined
        dense
      />

      <q-btn
        type="submit"
        color="secondary"
        text-color="black"
        no-caps
        label="Сохранить PIN"
        class="full-width"
        :loading="submitting"
      />

      <q-btn flat no-caps color="grey-6" label="Позже" @click="skipPin" />
    </q-form>

    <div v-if="auth.isAuthenticated" class="text-caption lc-mute q-mt-md text-center">
      {{ auth.userName }}
    </div>
  </AuthShell>
</template>

