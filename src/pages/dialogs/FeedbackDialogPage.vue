<script setup>
// Диалог «Сообщить об ошибке» (Фаза 14, задача 14.5).
//
// Точка входа — настройки, вкладка «поддержка». Отчёт создаётся офлайн-первым: `feedbackService`
// сначала кладёт его в локальную очередь, потом пробует отправить, поэтому диалог
// никогда не «висит» на сети и отчёт не теряется. Диагностика (версия, схема,
// состояние синка, хвост ошибок) собирается сервисом; данных мастерской в отчёте нет
// (`docs/FEEDBACK.md` §4), а полные логи подключаются отдельным тумблером.
//
// Списка последних отчётов в окне нет (правка владельца 17.09.2026): мастеру он не нужен,
// а «отчёт не потерялся» видно по счётчику «Отчётов в очереди» (и подписи в настройках).
// Полная история очереди остаётся доступной для диагностики — `feedbackRepo.listAll()`.
//
// Кнопка «копировать текст в буфер» — аварийный путь, когда сети/сервера нет вовсе:
// тот же «снимок для поддержки» (12.5) мастер пересылает любым каналом.
import { computed, ref } from 'vue'
import { copyToClipboard, useQuasar } from 'quasar'
import { useRoute } from 'vue-router'
import feedbackService from 'src/services/feedbackService.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_MESSAGE_MAX,
  canSubmitFeedback,
  feedbackTextFromReport,
} from 'src/utils/feedbackView.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const $q = useQuasar()
const route = useRoute()
const auth = useAuthStore()
const specializations = useSpecializationsStore()

/** Настройки обновляют счётчик «в очереди» по этому сигналу. */
const emit = defineEmits(['changed'])

const isOpen = ref(false)
const kind = ref('bug')
const message = ref('')
const contact = ref('')
const attachDiagnostics = ref(true)
const includeLogs = ref(false)
const saving = ref(false)
const pendingCount = ref(0)

const kindOptions = FEEDBACK_KINDS.map(value => ({ label: FEEDBACK_KIND_LABELS[value], value }))
const validation = computed(() => canSubmitFeedback(message.value))
const canSubmit = computed(() => validation.value.ok)
const profileName = computed(() => specializations.getSelectedSpecialization?.name || '')

/** Счётчик «в очереди»: мастер видит, что ни один отчёт не потерялся. */
async function refreshPending() {
  try {
    pendingCount.value = await feedbackService.pendingCount()
  } catch (error) {
    // Счётчик — не повод ломать диалог: отчёт всё равно можно создать и отправить.
    console.warn('[Feedback] Не удалось прочитать очередь отчётов:', error?.message)
  }
}

/** Открывается из настроек (вкладка «поддержка»): форма пустая, черновики обнуляются. */
async function open() {
  kind.value = 'bug'
  message.value = ''
  contact.value = ''
  attachDiagnostics.value = true
  includeLogs.value = false
  isOpen.value = true
  await refreshPending()
}

async function submitReport() {
  if (!canSubmit.value || saving.value) return

  saving.value = true

  try {
    const result = await feedbackService.submit({
      kind: kind.value,
      message: message.value,
      contact: contact.value,
      screen: route.fullPath,
      attachDiagnostics: attachDiagnostics.value,
      includeLogs: includeLogs.value,
      account: auth.userName || '',
      profile: profileName.value,
    })

    await refreshPending()

    emit('changed')

    if (result.sent) {
      isOpen.value = false
      $q.notify({
        type: 'positive',
        message: 'Спасибо! Отчёт отправлен разработчику',
        position: 'top',
        timeout: 3000,
      })
      return
    }

    message.value = ''
    $q.notify({
      type: 'info',
      message: 'Отчёт сохранён на устройстве',
      caption: 'уедет автоматически, когда появится сеть',
      position: 'top',
      timeout: 4000,
    })
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error?.message || 'Не удалось создать отчёт',
      position: 'top',
    })
  } finally {
    saving.value = false
  }
}

/** Аварийный путь без сервера: тот же отчёт текстом — в буфер обмена. */
async function copyReport() {
  const report = await feedbackService.preview({
    kind: kind.value,
    message: message.value,
    contact: contact.value,
    screen: route.fullPath,
    attachDiagnostics: true,
    includeLogs: includeLogs.value,
    account: auth.userName || '',
    profile: profileName.value,
  })

  await copyToClipboard(feedbackTextFromReport(report))

  $q.notify({
    type: 'info',
    message: 'Текст отчёта скопирован',
    caption: 'его можно переслать разработчику любым способом',
    position: 'top',
    timeout: 3000,
  })
}

defineExpose({ open })
</script>

<template>
  <LcDialogShell
    :model-value="isOpen"
    title="Сообщить об ошибке"
    subtitle="уйдёт разработчику вместе с диагностикой"
    confirm-label="Отправить"
    :confirm-disable="!canSubmit"
    :loading="saving"
    @update:model-value="isOpen = $event"
    @confirm="submitReport"
  >
    <div class="q-gutter-y-md">
      <q-select
        v-model="kind"
        :options="kindOptions"
        label="Тип обращения"
        outlined
        dense
        emit-value
        map-options
        color="secondary"
      />

      <q-input
        v-model="message"
        type="textarea"
        autogrow
        outlined
        label="Что случилось?"
        placeholder="Опишите, что вы делали и что пошло не так"
        :maxlength="FEEDBACK_MESSAGE_MAX"
        :error="message.length > 0 && !canSubmit"
        :error-message="validation.reason"
        counter
        autofocus
      />

      <q-input
        v-model="contact"
        outlined
        dense
        label="Как с вами связаться (необязательно)"
        color="secondary"
      />

      <div class="q-gutter-y-xs">
        <div class="row items-center no-wrap">
          <div class="col">
            <div class="lc-muted">Приложить диагностику</div>
            <div class="text-caption lc-mute">
              Версия приложения, версия схемы, состояние синхронизации и последние ошибки
            </div>
          </div>
          <q-toggle v-model="attachDiagnostics" color="secondary" />
        </div>

        <div class="row items-center no-wrap">
          <div class="col">
            <div class="lc-muted">Приложить полные логи</div>
            <div class="text-caption lc-mute">Последние 100 строк журнала приложения</div>
          </div>
          <q-toggle v-model="includeLogs" color="secondary" :disable="!attachDiagnostics" />
        </div>
      </div>

      <div class="text-caption lc-mute">
        Заказы, клиенты и суммы в отчёт не попадают. Отчётов в очереди:
        <b>{{ pendingCount }}</b>.
      </div>

      <q-btn
        class="full-width"
        no-caps
        flat
        dense
        color="secondary"
        icon="content_copy"
        label="копировать текст в буфер"
        @click="copyReport"
      />
    </div>
  </LcDialogShell>
</template>

<style scoped></style>

