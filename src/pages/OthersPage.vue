<script setup>

import { computed, onMounted, ref } from 'vue'
import SyncService from '../services/syncService.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'

const selectedSpecialization = ref(null)

// 1. Получаем экземпляр хранилища
const specializationsStore = useSpecializationsStore()

// 2. Создаем вычисляемое свойство для опций селекта
const specializationOptions = computed(() => specializationsStore.items.map(item => ({
  label: item.name,
  value: item.id
})))

// 3. Загружаем данные при монтировании компонента
onMounted(() => specializationsStore.load())

const sync = async () => {
  try {
    await SyncService.sync()
    console.log('Синхронизация завершена успешно.')
    await specializationsStore.load()
  } catch (error) {
    console.error('Ошибка при синхронизации:', error)
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
    </div>
  </q-page>
</template>

<style scoped></style>
