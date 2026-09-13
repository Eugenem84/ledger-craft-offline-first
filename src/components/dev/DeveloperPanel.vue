<script setup>
// src/components/dev/DeveloperPanel.vue
//
// «Режим разработчика» в настройках (Фаза 12, задача 12.5; доработка под отладку).
//
// Панель подключается лениво (`OthersPage.vue`) и показывается, только когда в
// настройках включён тумблер «Режим разработчика» (`utils/devMode.js`). Так логи и
// диагностику можно снять прямо на боевом устройстве, где нет консоли разработчика.
//
// Внутри — вкладки, чтобы экран не превращался в простыню:
//   • логи — буфер `logger` с фильтром по уровню, копированием и выгрузкой в файл;
//   • диагностика — окружение, версия схемы, синк, счётчики таблиц, снимок для поддержки;
//   • очередь — операции синка и «сдавшиеся»;
//   • опасное — полный сброс, удаление локальной БД, выключение режима.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { copyToClipboard, useQuasar } from 'quasar'
import SyncService from 'src/services/syncService.js'
import db from 'src/database/db.js'
import { API_URL, USE_MOCK } from 'src/config.js'
import { SCHEMA_VERSION } from 'src/database/schema-version.js'
import { getLastBackupAt } from 'src/services/backupService.js'
import { isNativePlatform, platformName } from 'src/utils/platform.js'
import { logger, getLogBuffer, clearLogBuffer, LOG_LEVELS } from 'src/utils/logger.js'
import { setDevMode } from 'src/utils/devMode.js'
import { exportTextFile, fileStamp } from 'src/services/logExport.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import { logAllServicesForDebugging } from 'src/repositories/servicesRepo.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import updateService from 'src/services/updateService.js'
import {
  buildDiagnosticSnapshot,
  describeOperation,
  describeSchemaVersion,
  describeSyncStatus,
  describeTableCounts,
  formatLogEntry,
  truncate,
} from 'src/utils/devInfo.js'
import LcSectionCard from 'src/components/ui/LcSectionCard.vue'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'

/** Таблицы, по которым показываем «сколько записей» (список фиксирован — имена в SQL не из ввода). */
const DB_TABLES = [
  'clients',
  'categories',
  'services',
  'product_categories',
  'products',
  'product_stocks',
  'equipment_models',
  'orders',
  'order_service',
  'order_product',
  'materials',
  'operations',
]

const $q = useQuasar()
const auth = useAuthStore()
const specializations = useSpecializationsStore()

const dangerConfirm = ref(null)
const schemaStored = ref(null)
const syncStatus = ref(SyncService.getStatus())
const queue = ref([])
const logs = ref([])
const lastBackup = ref(null)
const tableCounts = ref({})
const appVersion = ref(null)
/** Активная вкладка: логи открываются первыми — это самое частое при отладке. */
const tab = ref('logs')
/** Фильтр логов по уровню: `all` или один из `LOG_LEVELS`. */
const logLevel = ref('all')

const currentSpecializationName = computed(
  () => specializations.getSelectedSpecialization?.name || '—'
)

// Снимок окружения. `SCHEMA_VERSION` и `API_URL` тут же: и человеку, и тесту видно,
// куда смотреть при разборе. Аккаунт/профиль — чтобы понимать, чьи это данные.
const environmentRows = computed(() => [
  { label: 'платформа', value: `${platformName()}${isNativePlatform() ? ' (нативно)' : ''}` },
  { label: 'API_URL', value: API_URL },
  { label: 'USE_MOCK', value: USE_MOCK ? 'включены' : 'выключены' },
  { label: 'версия', value: appVersion.value || 'неизвестна' },
  { label: 'схема', value: String(SCHEMA_VERSION) },
  { label: 'аккаунт', value: auth.userName || '—' },
  { label: 'профиль', value: currentSpecializationName.value },
])

const schemaText = computed(() => describeSchemaVersion(SCHEMA_VERSION, schemaStored.value))
const syncRows = computed(() => describeSyncStatus(syncStatus.value))
const tableRows = computed(() => describeTableCounts(tableCounts.value))
const lastBackupText = computed(() =>
  lastBackup.value ? new Date(lastBackup.value).toLocaleString() : 'ещё не делался'
)

/** Логи выбранного уровня, новые сверху. */
const visibleLogs = computed(() => {
  const rows = logLevel.value === 'all' ? logs.value : getLogBuffer(logLevel.value)
  return rows.slice().reverse().map(formatLogEntry)
})

const logLevelOptions = computed(() => [
  { label: 'все', value: 'all' },
  ...LOG_LEVELS.map(level => ({ label: level, value: level })),
])

/** Очередь — от новых к старым (свежее интереснее). */
const recentQueue = computed(() => queue.value.map(describeOperation).reverse())
const failedItems = computed(() => queue.value.filter(item => item.status === 'failed'))
// «Заблокированные» ждут родителя, которого нет на сервере (дефект 14.11):
// сами не уедут — чинятся кнопкой «починить очередь».
const blockedItems = computed(() => queue.value.filter(item => item.status === 'blocked'))

/** Снимок «для поддержки»: склеиваем всё, что видно на экране, в один текст. */
const snapshotText = computed(() =>
  buildDiagnosticSnapshot([
    { title: 'окружение', rows: environmentRows.value },
    { title: 'схема', rows: [{ label: 'версия', value: schemaText.value }] },
    { title: 'синхронизация', rows: syncRows.value },
    { title: 'таблицы', rows: tableRows.value },
    { title: 'последние логи', lines: visibleLogs.value.slice(0, 60) },
  ])
)

/** Сколько записей в ключевых таблицах — видно, наполнена ли база и дошёл ли синк. */
async function loadTableCounts() {
  const counts = {}

  for (const table of DB_TABLES) {
    try {
      const rows = await db.query(`SELECT COUNT(*) AS count FROM ${table}`)
      counts[table] = Number(rows?.[0]?.count ?? 0)
    } catch (error) {
      counts[table] = `ошибка: ${error?.message || error}`
    }
  }

  tableCounts.value = counts
}

const refresh = async () => {
  try {
    await SyncService.refreshStatus()
    syncStatus.value = SyncService.getStatus()
    schemaStored.value = await db.getSchemaVersion()
    queue.value = await operationsRepo.listAll()
    logs.value = getLogBuffer()
    lastBackup.value = await getLastBackupAt()
    await loadTableCounts()

    const current = await updateService.loadCurrentVersion()
    appVersion.value =
      current?.versionName || (current?.versionCode ? `сборка ${current.versionCode}` : null)
  } catch (error) {
    console.error('[DevPanel] Не удалось собрать снимок окружения:', error)
    $q.notify({ type: 'negative', message: 'Не удалось собрать отладочные данные' })
  }
}

const clearLogs = () => {
  clearLogBuffer()
  logs.value = getLogBuffer()
}

const copyLogs = async () => {
  const text = visibleLogs.value.join('\n')

  if (!text) {
    $q.notify({ type: 'warning', message: 'Буфер логов пуст', position: 'top' })
    return
  }

  await copyToClipboard(text)
  $q.notify({ type: 'positive', message: 'Логи скопированы', position: 'top', timeout: 1500 })
}

const copySnapshot = async () => {
  await copyToClipboard(snapshotText.value)
  $q.notify({
    type: 'positive',
    message: 'Снимок для поддержки скопирован',
    position: 'top',
    timeout: 1500,
  })
}

const downloadLogs = async () => {
  try {
    const result = await exportTextFile(`ledgercraft-logs-${fileStamp()}.txt`, snapshotText.value)
    const where = result.uri ? `сохранено: ${result.uri}` : `скачано: ${result.fileName}`

    $q.notify({ type: 'positive', message: `Логи выгружены (${where})`, timeout: 4000 })
  } catch (error) {
    console.error('[DevPanel] Не удалось выгрузить логи:', error)
    $q.notify({ type: 'negative', message: `Не удалось выгрузить логи: ${error.message}` })
  }
}

// «Сдавшиеся» операции (исчерпали попытки / неисправимая ошибка) больше не уедут
// сами — их можно убрать, чтобы не пугали индикатор «не отправлено» (Фаза 12).
const discardFailed = async () => {
  const removed = await SyncService.discardFailedOperations()
  await refresh()

  $q.notify({
    type: removed ? 'info' : 'warning',
    message: removed ? `Убрано «сдавшихся» операций: ${removed}` : 'Сдавшихся операций нет',
    position: 'top',
  })
}

/**
 * «Починка очереди» (дефект живого прогона 14.11): операции, которые ждут родителя
 * без `server_id` (его вставка ушла из очереди / не дошла до сервера), перестают
 * отправляться вовсе — `POST /sync` не формируется, и приложение выглядит так,
 * будто «не видит сервер». Чиним: примиряем записи по `uuid_id`, пересобираем
 * потерянные вставки и дожимаем очередь.
 */
const repairQueue = async () => {
  const report = await SyncService.repairQueue()
  await refresh()

  const fixed = report.reconciled + report.requeuedParents
  const message = report.parents
    ? `Найдено родителей без server_id: ${report.parents} · примирено: ${report.reconciled} · ` +
      `пересобрано вставок: ${report.requeuedParents} · вернулось в работу: ${report.requeuedChildren} · ` +
      `осталось заблокированных: ${report.blockedLeft}`
    : `Осиротевших операций нет — очередь в порядке (в очереди: ${report.requeuedChildren})`

  $q.notify({
    type: fixed > 0 || !report.parents ? 'positive' : 'warning',
    message,
    position: 'top',
    timeout: 6000,
  })
}

const runDebugServices = async () => {
  await logAllServicesForDebugging()
  logs.value = getLogBuffer()
  $q.notify({ type: 'info', message: 'Таблица services выведена в консоль', position: 'top' })
}

/** Выключает режим разработчика из панели: секция тут же исчезает из настроек. */
const disableDevMode = () => {
  setDevMode(false)
  $q.notify({ type: 'info', message: 'Режим разработчика выключен', position: 'top' })
}

// Разрушительные действия — тот же подтверждающий диалог, что и раньше в «Ещё».
const fullReset = () => {
  dangerConfirm.value.open(
    'Полный сброс',
    'Локальная база будет очищена, данные перечитаются с сервера. Продолжить?',
    async () => {
      try {
        await SyncService.fullReset()
        logger.log('Полный сброс локальной базы выполнен.')
        await refresh()
      } catch (error) {
        console.error('Ошибка при полном сбросе:', error)
        $q.notify({ type: 'negative', message: 'Не удалось выполнить сброс' })
      }
    }
  )
}

const deleteDB = () => {
  dangerConfirm.value.open(
    'Удалить локальную БД',
    'Локальные данные будут удалены без возможности восстановления. Уверены?',
    async () => {
      try {
        await SyncService.deleteLocalDB()
        $q.notify({
          type: 'positive',
          message: 'Локальная база данных удалена. Перезагрузите страницу.',
          timeout: 0,
          actions: [
            { label: 'Перезагрузить', color: 'white', handler: () => window.location.reload() },
          ],
        })
      } catch (error) {
        console.error('Ошибка при удалении БД:', error)
        $q.notify({ type: 'negative', message: 'Не удалось удалить базу данных.' })
      }
    }
  )
}

let unsubscribe = null

onMounted(async () => {
  await refresh()
  unsubscribe = SyncService.subscribe(status => {
    syncStatus.value = status
  })
})

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <LcSectionCard title="режим разработчика" icon="bug_report">
    <q-tabs
      v-model="tab"
      dense
      no-caps
      align="justify"
      narrow-indicator
      active-color="secondary"
      indicator-color="secondary"
      class="q-mb-sm"
    >
      <q-tab name="logs" icon="terminal" label="логи" />
      <q-tab name="diag" icon="analytics" label="диагностика" />
      <q-tab
        name="queue"
        icon="pending_actions"
        :label="`очередь${failedItems.length + blockedItems.length ? ` (${failedItems.length + blockedItems.length})` : ''}`"
      />
      <q-tab name="danger" icon="warning" label="опасное" />
    </q-tabs>

    <q-tab-panels v-model="tab" animated class="bg-transparent">
      <!-- Логи: буфер logger с фильтром, копированием и выгрузкой -->
      <q-tab-panel name="logs" class="q-pa-none">
        <div class="row items-center q-gutter-x-sm q-mb-sm">
          <q-select
            v-model="logLevel"
            :options="logLevelOptions"
            dense
            outlined
            options-dense
            emit-value
            map-options
            color="secondary"
            class="col"
          />
          <q-btn flat dense no-caps size="sm" color="secondary" icon="refresh" @click="refresh" />
          <q-btn flat dense no-caps size="sm" color="secondary" label="очистить" @click="clearLogs" />
        </div>

        <div class="row items-center q-gutter-x-sm q-mb-sm">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="secondary"
            icon="content_copy"
            label="копировать"
            @click="copyLogs"
          />
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="secondary"
            icon="download"
            label="в файл"
            @click="downloadLogs"
          />
        </div>

        <div v-if="!visibleLogs.length" class="text-caption lc-mute">буфер пуст</div>
        <div v-for="(line, index) in visibleLogs" :key="index" class="text-caption lc-mute logs-line">
          {{ truncate(line, 200) }}
        </div>
      </q-tab-panel>
      <!-- Диагностика: окружение, схема, синк, таблицы, снимок -->
      <q-tab-panel name="diag" class="q-pa-none">
        <div class="lc-eyebrow">окружение</div>
        <div
          v-for="row in environmentRows"
          :key="row.label"
          class="row items-baseline no-wrap text-caption"
        >
          <span class="lc-muted dev-label">{{ row.label }}</span>
          <span class="col ellipsis lc-mute">{{ row.value }}</span>
        </div>
        <div class="row items-baseline no-wrap text-caption">
          <span class="lc-muted dev-label">схема</span>
          <span class="col lc-mute">{{ schemaText }}</span>
        </div>

        <q-separator dark class="q-my-sm" />

        <div class="lc-eyebrow">синхронизация</div>
        <div v-for="row in syncRows" :key="row.label" class="row items-baseline no-wrap text-caption">
          <span class="lc-muted dev-label">{{ row.label }}</span>
          <span class="col ellipsis lc-mute">{{ row.value }}</span>
        </div>

        <q-separator dark class="q-my-sm" />

        <div class="lc-eyebrow">таблицы</div>
        <div v-for="row in tableRows" :key="row.label" class="row items-baseline no-wrap text-caption">
          <span class="lc-muted dev-label">{{ row.label }}</span>
          <span class="col lc-mute">{{ row.value }}</span>
        </div>

        <q-separator dark class="q-my-sm" />

        <div class="row items-baseline no-wrap text-caption">
          <span class="lc-muted dev-label">последний бэкап</span>
          <span class="col lc-mute">{{ lastBackupText }}</span>
        </div>

        <div class="row items-center q-gutter-x-sm q-mt-sm">
          <q-btn flat dense no-caps size="sm" color="secondary" icon="refresh" label="обновить" @click="refresh" />
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="secondary"
            icon="content_copy"
            label="снимок для поддержки"
            @click="copySnapshot"
          />
          <q-btn flat dense no-caps size="sm" color="secondary" icon="download" label="в файл" @click="downloadLogs" />
        </div>
      </q-tab-panel>
      <!-- Очередь операций -->
      <q-tab-panel name="queue" class="q-pa-none">
        <div v-if="failedItems.length" class="row items-center q-gutter-x-sm q-mb-xs">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="negative"
            icon="delete_sweep"
            label="убрать сдавшиеся"
            @click="discardFailed"
          />
        </div>
        <div class="row items-center q-gutter-x-sm q-mb-xs">
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            :color="blockedItems.length ? 'warning' : 'secondary'"
            icon="build_circle"
            :label="blockedItems.length ? `починить очередь (${blockedItems.length})` : 'починить очередь'"
            @click="repairQueue"
          />
        </div>
        <div v-if="!recentQueue.length" class="text-caption lc-mute">очередь пуста</div>
        <div v-for="item in recentQueue" :key="item.key" class="text-caption lc-mute q-mb-xs">
          <b>{{ item.status }}</b> {{ item.type }} · {{ item.table }}
          <span v-if="item.attempts">· попыток: {{ item.attempts }}</span>
          <span v-if="item.deferredCount">· отложена: {{ item.deferredCount }}</span>
          <div v-if="item.lastError" class="lc-mute">причина: {{ item.lastError }}</div>
          <div class="ellipsis">{{ item.payload }}</div>
        </div>

        <q-btn
          class="full-width q-mt-sm"
          no-caps
          outline
          color="secondary"
          icon="database"
          label="Вывести таблицу services в консоль"
          @click="runDebugServices"
        />
      </q-tab-panel>

      <!-- Опасная зона -->
      <q-tab-panel name="danger" class="q-pa-none">
        <div class="lc-eyebrow">опасная зона</div>
        <q-btn
          class="full-width"
          no-caps
          flat
          color="negative"
          icon="restart_alt"
          label="Полный сброс (для отладки)"
          @click="fullReset"
        />
        <q-btn
          class="full-width"
          no-caps
          flat
          color="deep-orange"
          icon="delete_forever"
          label="Удалить локальную БД"
          @click="deleteDB"
        />
        <q-btn
          class="full-width q-mt-sm"
          no-caps
          outline
          color="secondary"
          icon="bug_report"
          label="Выключить режим разработчика"
          @click="disableDevMode"
        />
      </q-tab-panel>
    </q-tab-panels>

    <DeleteConfirmPage ref="dangerConfirm" />
  </LcSectionCard>
</template>

<style scoped>
.dev-label {
  min-width: 110px;
}

.logs-line {
  overflow-wrap: anywhere;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>



