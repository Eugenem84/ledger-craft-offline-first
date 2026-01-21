<script setup>

import SyncService from '../services/sincService.js'
const sync = async () => {
  try {
    await SyncService.sync()
    console.log('Синхронизация завершена успешно.')
  } catch (error) {
    console.error('Ошибка при синхронизации:', error)
  }
}

</script>

<template>
  <q-page padding>
    <q-btn
      label="Синхронизировать"
      color="primary"
      @click="sync"
    />
  </q-page>
</template>

<style scoped></style>
