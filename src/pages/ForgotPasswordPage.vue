<script setup>
// src/pages/ForgotPasswordPage.vue
//
// Восстановление пароля, шаг 1 (Фаза 16): вводим email — сервер шлёт письмо со
// ссылкой. Веб-версии приложения нет, поэтому ссылка ведёт на https-bridge бэкенда,
// а оттуда открывается приложение (`src/boot/deepLinks.js` →
// `src/domain/deepLinks.js`).
//
// 404 («адрес не зарегистрирован») показываем явно: пользователь сразу видит
// опечатку, а не ждёт письма, которого не будет (решение
// `PasswordResetController::sendResetLink`).
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { extractApiMessage } from 'src/utils/apiMessage.js'
// Общий каркас экранов входа/регистрации/восстановления (там же QLayout).
import AuthShell from 'src/components/ui/AuthShell.vue'

const auth = useAuthStore()
const router = useRouter()
const $q = useQuasar()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const notFound = ref(false)
const errorText = ref('')
const cooldown = ref(0)

/**
 * Повторную отправку ограничиваем на клиенте: на бэкенде запросы лимитированы
 * (`throttle:password-reset`, 5/мин на email+IP), и пользователю спокойнее видеть
 * таймер, чем 429 от сервера.
 */
function startCooldown(seconds = 60) {
  cooldown.value = seconds

  const timer = setInterval(() => {
    cooldown.value -= 1

    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function submit() {
  errorText.value = ''
  notFound.value = false
  loading.value = true

  try {
    const data = await auth.requestPasswordReset(email.value.trim())

    sent.value = true
    startCooldown()
    $q.notify({ color: 'positive', icon: 'mark_email_read', message: data?.message || 'Письмо отправлено' })
  } catch (error) {
    notFound.value = error?.response?.status === 404
    errorText.value = extractApiMessage(error, 'Не удалось отправить письмо. Попробуйте ещё раз.')

    $q.notify({ color: 'negative', icon: 'report_problem', message: errorText.value })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Восстановление пароля"
    subtitle="Пришлём письмо со ссылкой — она откроет приложение"
  >
    <q-banner v-if="sent" dense class="bg-positive text-white q-mb-md">
      Письмо отправлено. Проверьте входящие — и папку «Спам», если письма не видно.
    </q-banner>

    <q-banner v-if="errorText" dense class="bg-negative text-white q-mb-md">
      {{ errorText }}

      <template v-if="notFound">
        <q-btn
          flat
          dense
          no-caps
          color="white"
          label="Зарегистрироваться"
          class="q-ml-sm"
          @click="router.push('/register')"
        />
      </template>
    </q-banner>

    <q-form class="q-gutter-y-md" @submit="submit">
      <q-input
        v-model="email"
        type="email"
        label="Email"
        outlined
        dense
        autocomplete="username"
        :rules="[
          value => Boolean(value) || 'Укажите email',
          value => /.+@.+\..+/.test(String(value)) || 'Некорректный email',
        ]"
      />

      <q-btn
        type="submit"
        color="secondary"
        text-color="black"
        no-caps
        class="full-width"
        :loading="loading"
        :disable="cooldown > 0"
        :label="cooldown > 0 ? `Отправить снова через ${cooldown} с` : 'Отправить ссылку'"
      />

      <q-btn
        type="button"
        flat
        no-caps
        color="grey-6"
        label="Вспомнили пароль? Войти"
        class="full-width"
        @click="router.push('/login')"
      />
    </q-form>
  </AuthShell>
</template>
