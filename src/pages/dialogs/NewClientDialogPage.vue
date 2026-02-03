<script setup>
import {ref} from 'vue'
import {api} from "boot/axios.js";
import {useSpecializationsStore} from "stores/specializations.js";

const specializationStore = useSpecializationsStore()

const selectedSpecializationId= specializationStore.getSelectedSpecialization.id
const isOpen = ref(false)
const name = ref('')
const phone = ref('')

const emit = defineEmits(['client-added'])

function open(){
  isOpen.value = true
}

function close(){
  isOpen.value = false
}

defineExpose({open})

const addNew = async () => {
  try {
    const response = await api.post('/add_client', {
      name: name.value,
      phone: phone.value,
      specialization_id: selectedSpecializationId
    })
    name.value = ''
    phone.value = ''
    close()
    emit('client-added', response.data)
    console.log('response', response)
  } catch (err) {
    console.error('ошибка добавления клиента: ', err)
  }
}

</script>

<template>

  <q-dialog v-model="isOpen">
    <q-card>
      <q-card-section>
        <div class="text-h6"> новый клиент</div>
        <q-input v-model="name" label="Имя клиента" outlined class="q-mb-md" />
        <q-input v-model="phone" label="телефон" outlined class="q-mb-md" />
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
