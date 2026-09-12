<template>
  <router-view />
  <SyncStatusBar />
</template>

<script setup>
// Задачи 6.1/6.2: синк запускается фоном **после** монтирования (приложение уже отрисовано
// и не ждёт сеть), а индикатор состояния виден на любом маршруте.
import { onBeforeUnmount, onMounted } from 'vue'
import SyncStatusBar from 'src/components/SyncStatusBar.vue'
import syncService from 'src/services/syncService.js'

onMounted(() => {
  syncService.startAutoSync()
})

onBeforeUnmount(() => {
  syncService.stopAutoSync()
})
</script>
