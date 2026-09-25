<script setup>
// src/pages/ResetPasswordPage.vue
//
// Восстановление пароля, шаг 2 (Фаза 16): новый пароль по токену из письма.
//
// Токен и email приходят не ссылкой внутри SPA (веб-версии нет), а deep link'ом:
// письмо → https-bridge бэкенда → приложение (`src/boot/deepLinks.js`), поэтому
// параметры лежат в query текущего маршрута.
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { extractApiMessage } from 'src/utils/apiMessage.js'
import AuthShell from 'src/components/ui/AuthShell.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const $q = useQuasar()

// Токен и email пришли по deep link: /reset-password?token=…&email=…
const token = String(route.query.token || '')
const email = String(route.query.email || '')

const hasLink = computed(() => token !== '' && email !== '')
const form = reactive({ password: '', passwordConfirmation: '' })
const loading = ref(false)
const linkFailed = ref(false)

async function submit() {
  linkFailed.value = false
  loading.value = true

  try {
    const data = await auth.resetPassword({ token, email, ...form })

    $q.notify({
      color: 'positive',
      icon: 'check',
      message: data?.message || 'Пароль обновлён — войдите с новым паролем',
    })

    router.replace('/login')
  } catch (error) {
    // 422 без `errors` — токен/ссылка не подошли: подсказываем запросить письмо заново.
    linkFailed.value = error?.response?.status === 422

    $q.notify({
      color: 'negative',
      icon: 'report_problem',
      message: extractApiMessage(error, 'Не удалось сменить пароль. Попробуйте ещё раз.'),
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell title="Новый пароль" subtitle="Придумайте новый пароль для входа">
    <q-banner v-if="!hasLink" dense class="bg-orange-9 text-white">
      Ссылка неполная или уже использована — запросите письмо заново.
    </q-banner>

    <template v-if="!hasLink">
      <q-btn
        color="secondary"
        text-color="black"
        no-caps
        label="Запросить письмо"
        class="full-width q-mt-md"
        @click="router.push('/forgot-password')"
      />
    </template>

    <template v-else>
      <q-banner v-if="linkFailed" dense class="bg-orange-9 text-white q-mb-md">
        Ссылка недействительна или устарела — запросите письмо заново.
      </q-banner>

      <q-form class="q-gutter-y-md" @submit="submit">
        <div class="text-caption lc-mute">Аккаунт: {{ email }}</div>

        <q-input
          v-model="form.password"
          type="password"
          label="Новый пароль"
          outlined
          dense
          autocomplete="new-password"
          :rules="[
            value => Boolean(value) || 'Придумайте пароль',
            value => String(value).length >= 6 || 'Минимум 6 символов',
          ]"
        />

        <q-input
          v-model="form.passwordConfirmation"
          type="password"
          label="Повторите пароль"
          outlined
          dense
          autocomplete="new-password"
          :rules="[
            value => Boolean(value) || 'Повторите пароль',
            value => value === form.password || 'Пароли не совпадают',
          ]"
        />

        <q-btn
          type="submit"
          color="secondary"
          text-color="black"
          no-caps
          label="Сохранить пароль"
          class="full-width"
          :loading="loading"
        />

        <q-btn
          type="button"
          flat
          no-caps
          color="grey-6"
          label="Запросить письмо заново"
          class="full-width"
          @click="router.push('/forgot-password')"
        />
      </q-form>
    </template>
  </AuthShell>
</template>
