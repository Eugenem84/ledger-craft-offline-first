<script setup>
import {ref} from 'vue'
import { useCategoriesStore } from 'stores/useCategoriesStore.js'
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const categoriesStore = useCategoriesStore()
const specializationStore = useSpecializationsStore()

const isOpen = ref(false)
const name = ref('')

function open(){
  isOpen.value = true
}

function close(){
  isOpen.value = false
  name.value = ''
}

defineExpose({open})

const addNew = async () => {
  const selectedSpecialization = specializationStore.getSelectedSpecialization
  if (!selectedSpecialization || !selectedSpecialization.id) {
    $q.notify({
      type: 'negative',
      message: 'Сначала выберите специализацию',
      position: 'top',
      timeout: 2000
    })
    console.error('Невозможно добавить категорию: специализация не выбрана.')
    return
  }

  try {
    await categoriesStore.add({
      category_name: name.value,
      specialization_id: selectedSpecialization.id
    })
    close()
    $q.notify({
      type: 'positive',
      message: 'Категория добавлена',
      position: 'top',
      timeout: 1000
    })
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'Ошибка добавления категории',
      position: 'top',
      timeout: 1000
    })
    console.error('ошибка добавления сервис категории: ', err)
  }
}

</script>

<template>

  <q-dialog v-model="isOpen">
    <q-card>
      <q-card-section>
        <div class="text-h6"> Новая категория</div>
        <q-input v-model="name" label="Название категории" outlined class="q-mb-md" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Отмена" color="yellow" @click="close" />
        <q-btn flat label="Сохранить" color="yellow" @click="addNew" />
      </q-card-actions>
    </q-card>
  </q-dialog>

</template>

<style scoped>

</style>
