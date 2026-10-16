<script setup>
// src/components/SyncStatusDialog.vue
//
// Диалог состояния синхронизации (живой отчёт мастера 16.10.2026, задача 14.33).
//
// Почему он появился: значок синка в шапке — «только значок», подробности лежали в
// `q-tooltip`. На телефоне наведения нет, тултип не показывается, поэтому мастер видел
// **красный треугольник** и, по его словам, «ничего не выдаёт при нажатии»: тап запускал
// синк, а «сдавшиеся» операции не отправляются вовсе — то есть ничего и не менялось.
//
// Что делает диалог: показывает состояние теми же словами, что и подсказка
// (`syncStatusDetails`), перечисляет **что именно** не уехало (`operations`: тип, таблица,
// причина отказа) и даёт кнопки, которые мастер может нажать сам — без «Режима
// разработчика»: «Повторить отправку» (`failed`), «Починить очередь» (`blocked`),
// «Синхронизировать». Список и кнопки — из чистой функции `syncStatusView.js`
// (там же живёт правило «когда тап открывает диалог»), поэтому логика проверяется тестом.
import { computed, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import syncService from 'src/services/syncService.js'
import {
  syncStatusActions,
  syncStatusDetails,
  syncStatusOutcome,
  syncStatusView,
} from 'src/utils/syncStatusView.js'
import { describeOperation } from 'src/utils/devInfo.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** Снимок состояния синка — тот же, что у значка (`syncService.getStatus()`). */
  status: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue', 'changed'])

const $q = useQuasar()
const router = useRouter()

/** Операции, которые сами не уедут (заполняются при открытии диалога). */
const stuck = ref({ failed: [], blocked: [] })
/** Ключ выполняемой кнопки — для `loading` на ней. */
const busy = ref('')

const title = computed(() => syncStatusView(props.status).label)
const lines = computed(() => syncStatusDetails(props.status))
const actions = computed(() => syncStatusActions(props.status))

/**
 * «Что не уехало»: тип операции, таблица, счётчик попыток и причина отказа
 * (`operations.last_error`). Причина пишется синком с 14.22 — иначе разобрать
 * отказ было нельзя.
 */
const stuckRows = computed(() =>
  [
    ...stuck.value.failed.map(op => ({ ...describeOperation(op), kind: 'failed' })),
    ...stuck.value.blocked.map(op => ({ ...describeOperation(op), kind: 'blocked' })),
  ].filter(row => row.table || row.type)
)

async function loadStuck() {
  try {
    stuck.value = await syncService.listStuckOperations()
  } catch (error) {
    console.error('[SyncDialog] Не удалось прочитать проблемные операции:', error)
  }
}

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) loadStuck()
  }
)

/** «Повторить отправку»: возвращаем «сдавшиеся» в очередь и дожимаем синк. */
async function retryFailed() {
  const count = await syncService.retryFailedOperations()
  const left = Number(syncService.getStatus().failedCount) || 0

  $q.notify({
    type: left > 0 ? 'warning' : 'positive',
    message: left
      ? `Отправка снова не прошла: ${left} — причина ниже.`
      : `Повторил отправку: ${count}`,
    timeout: 4000,
  })
}

/** «Починить очередь»: примиряем записи по `uuid_id` и дожимаем отложенные операции. */
async function repairQueue() {
  const report = await syncService.repairQueue()
  const fixed = report.reconciled + report.requeuedParents

  $q.notify({
    type: fixed > 0 || !report.parents ? 'positive' : 'warning',
    message: report.parents
      ? `Примирено записей: ${report.reconciled} · пересобрано вставок: ${report.requeuedParents} · ` +
        `вернулось в работу: ${report.requeuedChildren}`
      : `Осиротевших операций нет (в очереди: ${report.requeuedChildren})`,
    timeout: 6000,
  })
}

async function run(action) {
  if (action.key === 'login') {
    emit('update:modelValue', false)
    router.push('/login')
    return
  }

  busy.value = action.key

  try {
    if (action.key === 'retry') {
      await retryFailed()
    } else if (action.key === 'repair') {
      await repairQueue()
    } else {
      await syncService.sync({ force: true })
      $q.notify({ ...syncStatusOutcome(syncService.getStatus()), timeout: 3000 })
    }

    await loadStuck()
    emit('changed')
  } catch (error) {
    console.error('[SyncDialog] Действие не удалось:', error)
    $q.notify({ type: 'negative', message: 'Не удалось выполнить действие', timeout: 3000 })
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    title="синхронизация"
    :subtitle="title"
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <div class="q-gutter-y-sm">
      <div v-for="(line, index) in lines" :key="index" class="text-body2">{{ line }}</div>
    </div>

    <!-- Что именно не уехало: без этого «не отправлено: 1» невозможно объяснить ни
         мастеру, ни владельцу (причина лежит в `operations.last_error`). -->
    <template v-if="stuckRows.length">
      <q-separator dark class="q-my-md" />

      <div class="text-caption lc-mute q-mb-sm">что не уехало</div>

      <div v-for="row in stuckRows" :key="row.key" class="q-mb-sm">
        <div class="text-caption">
          {{ row.kind === 'blocked' ? 'ждёт родителя на сервере' : 'отклонено сервером' }}:
          {{ row.type }} · {{ row.table }} · попыток: {{ row.attempts }}
        </div>
        <div class="text-caption lc-mute">{{ row.lastError || 'причина не записана' }}</div>
      </div>
    </template>

    <template #actions>
      <q-btn
        v-for="action in actions"
        :key="action.key"
        unelevated
        no-caps
        :color="action.color"
        :text-color="action.color === 'secondary' || action.color === 'warning' ? 'black' : 'white'"
        :label="action.label"
        :loading="busy === action.key"
        @click="run(action)"
      />
    </template>
  </LcDialogShell>
</template>

