<script setup>
import {ref} from 'vue'
import {api} from "boot/axios.js";


const isOpen = ref(false)
const name = ref('')

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['service_category-edited'])

function open(){
  isOpen.value = true
  name.value = props.data.category_name
}

function close(){
  isOpen.value = false
  name.value = ''
}

defineExpose({open})

const edit = async () => {
  console.log('props: ', props.data)
  try {
    const response = await api.post('/edit_category', {
      id: props.data.id,
      category_name: name.value,
    })
    name.value = ''
    close()
    emit('service_category-edited', response.data)
    console.log('response', response)
  } catch (err) {
    console.error('ошибка добавления сервис категории: ', err)
  }
}

const deleteServiceCategory = async () => {
  console.log('categoryId: ', props.data.id)
  try {
    const response = await api.post('/delete_category', {
      categoryId: props.data.id
    })
    close()
    emit('service_category-edited', response.data)
  } catch (err) {
    console.error('ошибка удаления категории: ', err)
  }
}

</script>

<template>

  <q-dialog v-model="isOpen">
    <q-card>
      <q-card-section>
        <div class="text-h6"> редактирование категории</div>
        <q-input v-model="name"
                 label="Название категории"
                 outlined class="q-mb-md"
                 :rules="[val => !!val || 'Обязательное поле']"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="удалить" color="yellow" @click="deleteServiceCategory" />
        <q-btn flat label="отмена" color="yellow" @click="close" />
        <q-btn flat label="сохранить" color="yellow" @click="edit" />
      </q-card-actions>
    </q-card>
  </q-dialog>

</template>

<style scoped>

</style>
