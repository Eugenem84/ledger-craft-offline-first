<template>
  <router-view />
  <!-- Индикатор синка живёт в шапке `MainLayout` на основных экранах; вне каркаса
       (карточка заказа, вход, регистрация, 404) рисуем плавающий вариант. -->
  <SyncStatusBar v-if="!inMainLayout" floating />
  <UpdateBanner />
</template>

<script setup>
// Задачи 6.1/6.2: синк запускается фоном **после** монтирования (приложение уже отрисовано
// и не ждёт сеть), а индикатор состояния виден на любом маршруте.
// Задача 7.4: пока нет входа (или приложение заперто PIN), синк не запускаем — он всё
// равно не авторизуется; после входа автозапуск включается сам и дожимает очередь.
// Задача 13.9: `UpdateBanner` показывает «доступна версия N» на всех маршрутах.
// Фаза 14 (14.4): вместе с автосинком включается досылка отчётов «Сообщить об ошибке» —
// она независима от синка (своя ручка и своя очередь), но живёт по тем же правилам:
// без входа ничего не отправляет, сеть появилась — дожимает без действий мастера.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import SyncStatusBar from 'src/components/SyncStatusBar.vue'
import UpdateBanner from 'src/components/UpdateBanner.vue'
import syncService from 'src/services/syncService.js'
import feedbackService from 'src/services/feedbackService.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'

const auth = useAuthStore()
const route = useRoute()

// `MainLayout` — родительский маршрут с `path: '/'`; если он есть в `matched`,
// индикатор уже отрисован в шапке и плавающий вариант не нужен.
const inMainLayout = computed(() => route.matched.some(record => record.path === '/'))

function applyAuthState() {
  if (auth.isAuthenticated && auth.unlocked) {
    syncService.startAutoSync()
    feedbackService.startAutoFlush()
  } else {
    syncService.stopAutoSync()
    feedbackService.stopAutoFlush()
  }

  // Обновляем индикатор (в т.ч. состояние «требуется вход» до первой попытки синка).
  void syncService.refreshStatus()
}

onMounted(applyAuthState)

watch(() => [auth.isAuthenticated, auth.unlocked], applyAuthState)

onBeforeUnmount(() => {
  syncService.stopAutoSync()
  feedbackService.stopAutoFlush()
})
</script>
