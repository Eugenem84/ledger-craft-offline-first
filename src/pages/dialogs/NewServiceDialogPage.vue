<script setup>
import {ref} from 'vue'
import {api} from "boot/axios.js";
import {useSpecializationsStore} from "stores/specializations.js";

const specializationStore = useSpecializationsStore()

const selectedSpecializationId= specializationStore.getSelectedSpecialization.id
const isOpen = ref(false)
const name = ref('')
const price = ref('')
const categoryId = ref('')

const emit = defineEmits(['service-added'])

const props = defineProps({
  data: {type: Number}
})

function open(){
  isOpen.value = true
  categoryId.value = props.data.value
}

function close(){
  isOpen.value = false
  categoryId.value = ''
}

defineExpose({open})

const addNew = async () => {
  try {
    console.log('category_id: ', props.data.id)
    const response = await api.post('/add_service', {
      service: name.value,
      price: price.value,
      category_id: props.data.id,
      specialization_id: selectedSpecializationId
    })
    name.value = ''
    price.value = ''
    categoryId.value = ''
    close()
    emit('service-added', response.data)
    console.log('response', response)
  } catch (err) {
    console.error('ошибка добавления сервиса: ', err)
  }
}

</script>

<template>

  <q-dialog v-model="isOpen">
    <q-card>
      <q-card-section>
        <div class="text-h6"> новый сервис</div>
        <q-input v-model="name" label="Название сервиса" outlined class="q-mb-md"/>
        <q-input v-model="price" label="цена" outlined class="q-mb-md" />
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
