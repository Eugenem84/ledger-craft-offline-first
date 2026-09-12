<template>
  <router-view />
  <SyncStatusBar />
</template>

<script setup>
// Задачи 6.1/6.2: синк запускается фоном **после** монтирования (приложение уже отрисовано
// и не ждёт сеть), а индикатор состояния виден на любом маршруте.
// Задача 7.4: пока нет входа (или приложение заперто PIN), синк не запускаем — он всё
// равно не авторизуется; после входа автозапуск включается сам и дожимает очередь.
import { onBeforeUnmount, onMounted, watch } from 'vue'
import SyncStatusBar from 'src/components/SyncStatusBar.vue'
import syncService from 'src/services/syncService.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'

const auth = useAuthStore()

function applyAuthState() {
  if (auth.isAuthenticated && auth.unlocked) {
    syncService.startAutoSync()
  } else {
    syncService.stopAutoSync()
  }

  // Обновляем индикатор (в т.ч. состояние «требуется вход» до первой попытки синка).
  void syncService.refreshStatus()
}

onMounted(applyAuthState)

watch(() => [auth.isAuthenticated, auth.unlocked], applyAuthState)

onBeforeUnmount(() => {
  syncService.stopAutoSync()
})
</script>
