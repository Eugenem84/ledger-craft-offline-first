<script setup>
import {ref} from 'vue'
import { useServicesStore } from 'stores/useServicesStore.js'
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const servicesStore = useServicesStore()
const specializationStore = useSpecializationsStore()

const isOpen = ref(false)
const name = ref('')
const price = ref('')
const category = ref(null)

defineExpose({open})

function open(selectedCategory){
  category.value = selectedCategory
  isOpen.value = true
}

function close(){
  isOpen.value = false
  name.value = ''
  price.value = ''
  category.value = null
}

const addNew = async () => {
  const selectedSpecialization = specializationStore.getSelectedSpecialization
  if (!selectedSpecialization || !selectedSpecialization.id) {
    $q.notify({
      type: 'negative',
      message: 'Сначала выберите специализацию',
      position: 'top',
      timeout: 2000
    })
    return
  }
  if (!category.value || !category.value.id) {
    $q.notify({
      type: 'negative',
      message: 'Категория не выбрана',
      position: 'top',
      timeout: 2000
    })
    return
  }

  try {
    await servicesStore.add({
      service: name.value,
      price: price.value,
      category_id: category.value.id,
      specialization_id: selectedSpecialization.id
    })
    close()
    $q.notify({
      type: 'positive',
      message: 'Услуга добавлена',
      position: 'top',
      timeout: 1000
    })
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'Ошибка добавления услуги',
      position: 'top',
      timeout: 1000
    })
    console.error('ошибка добавления сервиса: ', err)
  }
}

</script>

<template>
  <q-dialog v-model="isOpen">
    <q-card>
      <q-card-section>
        <div class="text-h6">Новая услуга</div>
        <q-input v-model="name" label="Название услуги" outlined class="q-mb-md"/>
        <q-input v-model="price" label="Цена" outlined class="q-mb-md" />
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
