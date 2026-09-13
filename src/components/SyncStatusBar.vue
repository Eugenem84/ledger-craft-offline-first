<script setup>
// src/components/SyncStatusBar.vue
//
// Индикатор сети и синка (задача 6.2): «нет сети», «синхронизация…», «ошибка синка»,
// «не отправлено: N». Тап по бейджу — ручная синхронизация (`sync({ force: true })`,
// то есть в обход паузы после сбоя, задача 3.7).
//
// Одно место монтирования — шапка `MainLayout.vue` (основные экраны). Плавающего варианта
// на маршрутах вне каркаса больше нет: на карточке заказа чип висел в 72px от нижнего края
// (там нет таббара) и перекрывал список позиций — отчёт мастера 14.11, живой прогон 13.09.2026.
//
// Состояние берётся из `syncService.getStatus()`/`subscribe()`, а подпись и цвет —
// из чистой функции `syncStatusView.js` (в офлайне она отдаёт «нет сети»).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import syncService from 'src/services/syncService.js'
import { syncStatusView } from 'src/utils/syncStatusView.js'

const router = useRouter()
const status = ref(syncService.getStatus())
const manualSyncing = ref(false)

const view = computed(() => syncStatusView(status.value))
const loading = computed(() => status.value.syncing || manualSyncing.value)

/** На светлом жёлто/янтарном фоне читается чёрный текст, на остальных — белый. */
const textColor = computed(() => (['secondary', 'warning'].includes(view.value.color) ? 'black' : 'white'))

const details = computed(() => {
  const s = status.value
  const lines = []

  if (s.requiresAuth) {
    lines.push('Нужен вход в аккаунт — синхронизация недоступна.')
  }
  if (s.online === false) {
    lines.push('Нет подключения к интернету — изменения сохраняются локально.')
  }
  if (s.pendingCount > 0) {
    lines.push(`Ждут отправки: ${s.pendingCount}`)
  }
  if (s.failedCount > 0) {
    lines.push(
      `Не удалось отправить: ${s.failedCount} — операции «сдались», их можно убрать в «Режиме разработчика».`
    )
  }
  if (s.lastError) {
    lines.push(`Последняя ошибка: ${s.lastError}`)
  }

  const waitMs = s.nextRetryAt - Date.now()
  if (waitMs > 0) {
    lines.push(`Повтор через ${Math.ceil(waitMs / 1000)} с`)
  }
  if (!lines.length) {
    lines.push('Все изменения синхронизированы.')
  }

  if (!s.requiresAuth) {
    lines.push('Нажмите, чтобы синхронизировать сейчас.')
  } else {
    lines.push('Нажмите, чтобы перейти ко входу.')
  }
  return lines
})

let unsubscribe = null

onMounted(async () => {
  unsubscribe = syncService.subscribe(next => {
    status.value = next
  })

  // Размер очереди лежит в БД, а не в памяти: на старте индикатор перечитывает его сам.
  await syncService.refreshStatus()
})

onBeforeUnmount(() => {
  if (unsubscribe) unsubscribe()
})

async function syncNow() {
  if (loading.value) return

  // Без входа кнопка ведёт на экран входа, а не «в никуда» (задача 7.4).
  if (status.value.requiresAuth) {
    router.push('/login')
    return
  }

  manualSyncing.value = true
  try {
    await syncService.sync({ force: true })
  } finally {
    manualSyncing.value = false
  }
}
</script>

<template>
  <div class="sync-status">
    <q-btn
      dense
      no-caps
      unelevated
      size="sm"
      class="lc-sync-chip lc-sync-chip--xs text-caption"
      :color="view.color"
      :text-color="textColor"
      :icon="view.icon"
      :label="view.label"
      :loading="loading"
      @click="syncNow"
    >
      <q-tooltip class="text-caption" max-width="280px">
        <div v-for="(line, index) in details" :key="index">{{ line }}</div>
      </q-tooltip>
    </q-btn>
  </div>
</template>
