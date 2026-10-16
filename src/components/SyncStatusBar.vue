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
// Правка владельца (15.09.2026): чип стал **только значком** — без подписи и без `label`
// («индикатор бесит»). Слово состояния осталось в тултипе и в `aria-label` (доступность),
// а рядом в шапке появилась мелкая серая версия приложения (`MainLayout`,
// `useUpdateStore.currentVersionShort`).
//
// Живой отчёт мастера 16.10.2026 (**боевой** контур, задача 14.33): «на вкладке заказ в
// правом верхнем углу горит красным треугольник и ничего не выдаёт при нажатии». Причин
// было две: (1) на телефоне наведения нет — тултип с объяснением не показывался никогда;
// (2) тап запускал синк, а «сдавшиеся» (`failed`) и «заблокированные» (`blocked`) операции
// не отправляются вовсе, поэтому визуально не происходило ничего. Теперь: в проблемных
// состояниях тап открывает диалог (`SyncStatusDialog.vue` — что не уехало и что делать), а
// обычный тап заканчивается всплывающим итогом (`syncStatusOutcome`), то есть молчания нет
// ни в одном случае.
//
// Состояние берётся из `syncService.getStatus()`/`subscribe()`, а подпись и цвет —
// из чистой функции `syncStatusView.js` (в офлайне она отдаёт «нет сети»).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import syncService from 'src/services/syncService.js'
import {
  syncStatusDetails,
  syncStatusNeedsAttention,
  syncStatusOutcome,
  syncStatusView,
} from 'src/utils/syncStatusView.js'
import SyncStatusDialog from 'src/components/SyncStatusDialog.vue'

const $q = useQuasar()
const router = useRouter()
const status = ref(syncService.getStatus())
const manualSyncing = ref(false)
const dialogOpen = ref(false)

const view = computed(() => syncStatusView(status.value))
const loading = computed(() => status.value.syncing || manualSyncing.value)

/** На светлом жёлто/янтарном фоне читается чёрный текст, на остальных — белый. */
const textColor = computed(() => (['secondary', 'warning'].includes(view.value.color) ? 'black' : 'white'))

/** Подробности для тултипа (на компьютере) — тот же текст, что и в диалоге. */
const details = computed(() => syncStatusDetails(status.value))

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

/**
 * Тап по значку (задача 14.33).
 *
 * Проблемное состояние — сначала **объясняем** (диалог): «сдавшиеся» и «заблокированные»
 * операции синк не отправляет, поэтому молчаливый повтор для мастера выглядел как
 * «ничего не выдаёт». Во всех остальных состояниях тап остаётся привычным «синхронизировать
 * сейчас» и заканчивается всплывающим итогом.
 */
function onChipClick() {
  if (loading.value) return

  if (syncStatusNeedsAttention(status.value)) {
    dialogOpen.value = true
    return
  }

  syncNow()
}

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
    // Итог словами: тап по значку всегда что-то сообщает (живой отчёт 16.10.2026).
    $q.notify({ ...syncStatusOutcome(syncService.getStatus()), timeout: 3000 })
  } finally {
    manualSyncing.value = false
  }
}

/** Диалог изменил очередь (повтор отправки/починка) — перечитываем счётчики. */
async function refreshStatus() {
  status.value = await syncService.refreshStatus()
}
</script>

<template>
  <div class="sync-status">
    <!-- Только значок: цвет и иконка несут состояние, подробности — в тултипе,
         а текст состояния дублируется в `aria-label` (доступность). Модификатор по
         `kind` даёт индикатору свой, более глубокий зелёный для «синхронизировано». -->
    <q-btn
      dense
      round
      unelevated
      size="sm"
      class="lc-sync-chip lc-sync-chip--icon"
      :class="`lc-sync-chip--${view.kind}`"
      :color="view.color"
      :text-color="textColor"
      :icon="view.icon"
      :loading="loading"
      :aria-label="`синхронизация: ${view.label}`"
      @click="onChipClick"
    >
      <q-tooltip class="text-caption" max-width="280px">
        <div v-for="(line, index) in details" :key="index">{{ line }}</div>
      </q-tooltip>
    </q-btn>

    <!-- Диалог состояния: объясняет «красный треугольник» и даёт мастеру действия
         (живой отчёт 16.10.2026, задача 14.33). Открывается тапом из проблемного
         состояния — на телефоне тултипа не бывает. -->
    <SyncStatusDialog v-model="dialogOpen" :status="status" @changed="refreshStatus" />
  </div>
</template>
