<script setup>
// src/pages/VerifyEmailPage.vue
//
// Подтверждение почты (Фаза 16). Верификация **мягкая**: пока адрес не подтверждён,
// вход, работа и синк доступны — письмо нужно, чтобы можно было восстановить пароль.
//
// На эту страницу приложение попадает по deep link'у из письма: сервер проверил
// подпись и увёл на `/app/verified?status=verified|invalid`
// (`EmailVerificationController`, `src/boot/deepLinks.js`). Статус приходит в query.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { extractApiMessage } from 'src/utils/apiMessage.js'
import AuthShell from 'src/components/ui/AuthShell.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const $q = useQuasar()

// Бэкенд уводит сюда со статусом verified/invalid; без статуса — страница открыта
// вручную (например, из настроек).
const status = String(route.query.status || '')
const loading = ref(false)
const cooldown = ref(0)

const isVerified = computed(() => auth.isEmailVerified)
const userEmail = computed(() => auth.user?.email || '')

const resendLabel = computed(() =>
  cooldown.value > 0 ? `Отправить снова через ${cooldown.value} с` : 'Отправить письмо повторно'
)

/**
 * Повторную отправку ограничиваем на клиенте: на бэкенде запросы лимитированы
 * (`throttle:verification`, 3/мин на пользователя+IP) — пользователю спокойнее
 * видеть таймер, чем 429.
 */
function startCooldown(seconds = 60) {
  cooldown.value = seconds

  const timer = setInterval(() => {
    cooldown.value -= 1

    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function resend() {
  loading.value = true

  try {
    const data = await auth.resendVerificationEmail()

    startCooldown()
    $q.notify({ color: 'positive', icon: 'mark_email_read', message: data?.message || 'Письмо отправлено' })
  } catch (error) {
    $q.notify({
      color: 'negative',
      icon: 'report_problem',
      message: extractApiMessage(error, 'Не удалось отправить письмо. Попробуйте ещё раз.'),
    })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // Перешли по ссылке и адрес уже подтверждён — перечитываем профиль, чтобы баннер
  // «подтвердите почту» погас без перезахода в приложение.
  if (auth.isAuthenticated) await auth.fetchMe()
})
</script>

<template>
  <AuthShell title="Подтверждение почты" subtitle="Письмо приходит на адрес регистрации">
    <!-- Перешли по ссылке из письма — адрес подтверждён -->
    <template v-if="status === 'verified'">
      <q-banner dense class="bg-positive text-white">
        Почта подтверждена. Теперь можно восстановить пароль, если вы его забудете.
      </q-banner>

      <q-btn
        color="secondary"
        text-color="black"
        no-caps
        label="Открыть приложение"
        class="full-width q-mt-md"
        @click="router.replace(auth.isAuthenticated ? '/orders' : '/login')"
      />
    </template>

    <!-- Ссылка недействительна или устарела -->
    <template v-else-if="status === 'invalid'">
      <q-banner dense class="bg-orange-9 text-white">
        Ссылка недействительна или устарела.
      </q-banner>

      <template v-if="auth.isAuthenticated && !isVerified">
        <q-btn
          color="secondary"
          text-color="black"
          no-caps
          class="full-width q-mt-md"
          :label="resendLabel"
          :loading="loading"
          :disable="cooldown > 0"
          @click="resend"
        />
      </template>

      <q-btn
        v-else
        color="secondary"
        text-color="black"
        no-caps
        label="Войти"
        class="full-width q-mt-md"
        @click="router.push('/login')"
      />
    </template>

    <!-- Статуса нет: страница открыта из приложения -->
    <template v-else-if="auth.isAuthenticated && isVerified">
      <q-banner dense class="bg-positive text-white">Почта уже подтверждена.</q-banner>

      <q-btn
        color="secondary"
        text-color="black"
        no-caps
        label="На главную"
        class="full-width q-mt-md"
        @click="router.replace('/orders')"
      />
    </template>

    <template v-else-if="auth.isAuthenticated">
      <div class="text-caption lc-mute q-mb-md">
        Мы отправили письмо со ссылкой на <b>{{ userEmail }}</b>. Перейдите по ней — и адрес
        подтвердится. Письма не видно? Проверьте папку «Спам».
      </div>

      <q-btn
        color="secondary"
        text-color="black"
        no-caps
        class="full-width"
        :label="resendLabel"
        :loading="loading"
        :disable="cooldown > 0"
        @click="resend"
      />

      <q-btn
        flat
        no-caps
        color="grey-6"
        label="На главную"
        class="full-width q-mt-sm"
        @click="router.replace('/orders')"
      />
    </template>

    <template v-else>
      <div class="text-caption lc-mute q-mb-md">
        Войдите, чтобы подтвердить почту, или создайте новый аккаунт.
      </div>

      <q-btn
        color="secondary"
        text-color="black"
        no-caps
        label="Войти"
        class="full-width"
        @click="router.push('/login')"
      />

      <q-btn
        flat
        no-caps
        color="grey-6"
        label="Зарегистрироваться"
        class="full-width q-mt-sm"
        @click="router.push('/register')"
      />
    </template>
  </AuthShell>
</template>
