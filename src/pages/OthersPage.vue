<script setup>

import { computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import SyncService from '../services/syncService.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'

const $q = useQuasar()

// 1. Получаем экземпляр хранилища
const specializationsStore = useSpecializationsStore()

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
onMounted(() => {
  specializationsStore.load().then(() => {
    // Первая специализация будет выбрана по умолчанию в сторе
  })
})

const sync = async () => {
  try {
    await SyncService.sync()
    console.log('Синхронизация завершена успешно.')
    await specializationsStore.load()
  } catch (error) {
    console.error('Ошибка при синхронизации:', error)
  }
}

const fullReset = async () => {
  try {
    await SyncService.fullReset()
    console.log('Полный сброс локальной базы выполнен.')
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
