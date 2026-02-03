<script setup>
import {ref} from 'vue'
import {api} from "boot/axios.js";
import {useSpecializationsStore} from "stores/specializations.js";

const specializationStore = useSpecializationsStore()

const selectedSpecializationId= specializationStore.getSelectedSpecialization.id
const isOpen = ref(false)
const name = ref('')

const emit = defineEmits(['service_category-added'])

function open(){
  isOpen.value = true
}

function close(){
  isOpen.value = false
}

defineExpose({open})

const addNew = async () => {
  try {
    const response = await api.post('/add_category', {
      category_name: name.value,
      specialization_id: selectedSpecializationId
    })
    name.value = ''
    close()
    emit('service_category-added', response.data)
    console.log('response', response)
  } catch (err) {
    console.error('ошибка добавления сервис категории: ', err)
  }
}

</script>

<template>

  <q-dialog v-model="isOpen">
    <q-card>
      <q-card-section>
        <div class="text-h6"> новая категория</div>
        <q-input v-model="name" label="Название категории" outlined class="q-mb-md" />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="отмена" color="yellow" @click="close" />
        <q-btn flat label="сохранить" color="yellow" @click="addNew" />
      </q-card-actions>
    </q-card>
  </q-dialog>

</template>

<style scoped>

</style>
