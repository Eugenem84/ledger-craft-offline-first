<script setup>
// src/components/dev/DeveloperPanel.vue
//
// «Режим разработчика» в настройках (Фаза 12, задача 12.5).
//
// ⚠️ Панель НЕ должна попадать в prod-сборку: её подключает `OthersPage.vue`
// динамическим импортом под `import.meta.env.DEV` (см. комментарий там). Здесь
// же собрано всё отладочное: снимок окружения, версия схемы, состояние синка,
// очередь операций, буфер логов, последний бэкап, а также перенесённые из
// пользовательских настроек «полный сброс» и «удалить локальную БД» (задача 12.4).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import SyncService from 'src/services/syncService.js'
import db from 'src/database/db.js'
import { API_URL, USE_MOCK } from 'src/config.js'
import { SCHEMA_VERSION } from 'src/database/schema-version.js'
import { getLastBackupAt } from 'src/services/backupService.js'
import { isNativePlatform, platformName } from 'src/utils/platform.js'
import { logger, getLogBuffer, clearLogBuffer } from 'src/utils/logger.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import { logAllServicesForDebugging } from 'src/repositories/servicesRepo.js'
import {
  describeOperation,
  describeSchemaVersion,
  describeSyncStatus,
  formatLogEntry,
  truncate,
} from 'src/utils/devInfo.js'
import LcSectionCard from 'src/components/ui/LcSectionCard.vue'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'

const $q = useQuasar()

const dangerConfirm = ref(null)
const schemaStored = ref(null)
const syncStatus = ref(SyncService.getStatus())
const queue = ref([])
const logs = ref([])
const lastBackup = ref(null)

// Снимок окружения статичен — считаем один раз.
const environment = [
  { label: 'платформа', value: `${platformName()}${isNativePlatform() ? ' (нативно)' : ''}` },
  { label: 'API_URL', value: API_URL },
  { label: 'USE_MOCK', value: USE_MOCK ? 'включены' : 'выключены' },
]

const schemaText = computed(() => describeSchemaVersion(SCHEMA_VERSION, schemaStored.value))
const syncRows = computed(() => describeSyncStatus(syncStatus.value))
const lastBackupText = computed(() =>
  lastBackup.value ? new Date(lastBackup.value).toLocaleString() : 'ещё не делался'
)

/** Очередь и логи — от новых к старым (свежее интереснее). */
const recentQueue = computed(() => queue.value.map(describeOperation).reverse())
const recentLogs = computed(() =>
  logs.value
    .slice()
    .reverse()
    .map(formatLogEntry)
)

const refresh = async () => {
  try {
    await SyncService.refreshStatus()
    syncStatus.value = SyncService.getStatus()
    schemaStored.value = await db.getSchemaVersion()
    queue.value = await operationsRepo.listAll()
    logs.value = getLogBuffer()
    lastBackup.value = await getLastBackupAt()
  } catch (error) {
    console.error('[DevPanel] Не удалось собрать снимок окружения:', error)
    $q.notify({ type: 'negative', message: 'Не удалось собрать отладочные данные' })
  }
}

const clearLogs = () => {
  clearLogBuffer()
  logs.value = getLogBuffer()
}

const runDebugServices = async () => {
  await logAllServicesForDebugging()
  logs.value = getLogBuffer()
  $q.notify({ type: 'info', message: 'Таблица services выведена в консоль', position: 'top' })
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
    <div class="q-gutter-y-sm">
      <!-- Окружение и схема -->
      <div class="lc-eyebrow">окружение</div>
      <div
        v-for="row in environment"
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

      <!-- Синхронизация -->
      <div class="lc-eyebrow">синхронизация</div>
      <div v-for="row in syncRows" :key="row.label" class="row items-baseline no-wrap text-caption">
        <span class="lc-muted dev-label">{{ row.label }}</span>
        <span class="col ellipsis lc-mute">{{ row.value }}</span>
      </div>

      <q-btn
        class="full-width"
        no-caps
        outline
        color="secondary"
        icon="refresh"
        label="Обновить снимок"
        @click="refresh"
      />

      <q-separator dark class="q-my-sm" />

      <!-- Очередь операций -->
      <q-expansion-item
        dense
        switch-toggle-side
        icon="pending_actions"
        :label="`очередь операций · ${queue.length}`"
      >
        <div v-if="!recentQueue.length" class="text-caption lc-mute">очередь пуста</div>
        <div v-for="item in recentQueue" :key="item.key" class="text-caption lc-mute q-mb-xs">
          <b>{{ item.status }}</b> {{ item.type }} · {{ item.table }}
          <div class="ellipsis">{{ item.payload }}</div>
        </div>
      </q-expansion-item>

      <!-- Буфер логов -->
      <q-expansion-item
        dense
        switch-toggle-side
        icon="terminal"
        :label="`буфер логов · ${logs.length}`"
      >
        <div class="row items-center q-gutter-x-sm q-mb-xs">
          <q-btn flat dense no-caps size="sm" color="secondary" label="очистить" @click="clearLogs" />
        </div>
        <div v-if="!recentLogs.length" class="text-caption lc-mute">буфер пуст</div>
        <div v-for="(line, index) in recentLogs" :key="index" class="text-caption lc-mute ellipsis">
          {{ truncate(line, 160) }}
        </div>
      </q-expansion-item>

      <q-separator dark class="q-my-sm" />

      <div class="row items-baseline no-wrap text-caption">
        <span class="lc-muted dev-label">последний бэкап</span>
        <span class="col lc-mute">{{ lastBackupText }}</span>
      </div>

      <q-btn
        class="full-width"
        no-caps
        outline
        color="secondary"
        icon="database"
        label="Вывести таблицу services в консоль"
        @click="runDebugServices"
      />

      <q-separator dark class="q-my-sm" />

      <!-- Перенесено из пользовательских настроек (задача 12.4). -->
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
    </div>

    <DeleteConfirmPage ref="dangerConfirm" />
  </LcSectionCard>
</template>

<style scoped>
.dev-label {
  min-width: 92px;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
