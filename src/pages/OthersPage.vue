<script setup>
import { logger } from 'src/utils/logger'

import { computed, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import SyncService from '../services/syncService.js'
import { createBackup, getLastBackupAt } from 'src/services/backupService.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'

const $q = useQuasar()

// 1. Получаем экземпляр хранилища
const specializationsStore = useSpecializationsStore()

// Бэкап локальной БД (задача 4.4): на Android — файл в документах устройства,
// в браузере — скачивание дампа `.sqlite`.
const backupLoading = ref(false)
const lastBackupAtValue = ref(null)
const lastBackupAt = computed(() => {
  if (!lastBackupAtValue.value) return 'ещё не делался'
  return new Date(lastBackupAtValue.value).toLocaleString()
})

// 2. Создаем вычисляемое свойство для опций селекта
const specializationOptions = computed(() => specializationsStore.items.map(item => ({
  label: item.name,
  value: item.id
})))

// 3. Создаем вычисляемое свойство, связанное с хранилищем, для v-model
const selectedSpecialization = computed({
  get: () => specializationsStore.selectedId,
  set: (id) => specializationsStore.select(id)
})

// 4. Загружаем данные при монтировании компонента
onMounted(async () => {
  await specializationsStore.load() // Первая специализация будет выбрана по умолчанию в сторе
  lastBackupAtValue.value = await getLastBackupAt()
})

const sync = async () => {
  try {
    await SyncService.sync()
    logger.log('Синхронизация завершена успешно.')
    await specializationsStore.load()
  } catch (error) {
    console.error('Ошибка при синхронизации:', error)
  }
}

const fullReset = async () => {
  try {
    await SyncService.fullReset()
    logger.log('Полный сброс локальной базы выполнен.')
    await specializationsStore.load() // Перезагружаем данные в сторе (теперь они будут пустыми)
  } catch (error) {
    console.error('Ошибка при полном сбросе:', error)
  }
}

const deleteDB = async () => {
  try {
    await SyncService.deleteLocalDB()
    $q.notify({
      type: 'positive',
      message: 'Локальная база данных удалена. Перезагрузите страницу.',
      timeout: 0, // не скрывать автоматически
      // noinspection JSUnusedGlobalSymbols
      actions: [{ label: 'Перезагрузить', color: 'white', handler: () => { window.location.reload() } }],
    })
  } catch (error) {
    console.error('Ошибка при удалении БД:', error)
    $q.notify({ type: 'negative', message: 'Не удалось удалить базу данных.' })
  }
}

// Бэкап локальной БД (задача 4.4). На Android файл ляжет в документы устройства,
// в браузере дамп скачается файлом.
const makeBackup = async () => {
  backupLoading.value = true
  try {
    const backup = await createBackup()
    lastBackupAtValue.value = backup.createdAt
    $q.notify({
      type: 'positive',
      message: `Бэкап создан: ${backup.fileName}`,
      timeout: 4000,
    })
  } catch (error) {
    console.error('Ошибка при создании бэкапа:', error)
    $q.notify({ type: 'negative', message: `Не удалось создать бэкап: ${error.message}` })
  } finally {
    backupLoading.value = false
  }
}

</script>

<template>
  <q-page padding class="bg-dark text-white">
    <div class="q-gutter-y-md" style="max-width: 400px">
      <q-select
        v-model="selectedSpecialization"
        :loading="specializationsStore.loading"
        :options="specializationOptions"
        label="Выберите специализацию"
        outlined
        dark
        color="white"
        label-color="white"
        emit-value
        map-options
      />

      <q-btn
        label="Синхронизировать"
        color="primary"
        @click="sync"
      />

      <q-btn
        label="Создать бэкап"
        color="primary"
        :loading="backupLoading"
        @click="makeBackup"
      >
        <q-tooltip>Копия локальной базы: на Android — файл в документах, в браузере — скачивание</q-tooltip>
      </q-btn>
      <div class="text-caption">Последний бэкап: {{ lastBackupAt }}</div>

      <q-btn
        label="Полный сброс (для отладки)"
        color="negative"
        @click="fullReset"
      />

      <q-btn
        label="Удалить локальную БД"
        color="deep-orange"
        @click="deleteDB"
      />
    </div>
  </q-page>
</template>

<style scoped></style>
