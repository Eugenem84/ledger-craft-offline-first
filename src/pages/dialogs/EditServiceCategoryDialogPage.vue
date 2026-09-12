<script setup>
import { logger } from 'src/utils/logger'
import { ref } from 'vue'
import { api } from 'boot/axios.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'


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
  logger.log('props: ', props.data)
  try {
    const response = await api.post('/edit_category', {
      id: props.data.id,
      category_name: name.value,
    })
    name.value = ''
    close()
    emit('service_category-edited', response.data)
    logger.log('response', response)
  } catch (err) {
    console.error('ошибка добавления сервис категории: ', err)
  }
}

const deleteServiceCategory = async () => {
  logger.log('categoryId: ', props.data.id)
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
  <LcDialogShell
    :model-value="isOpen"
    title="Редактирование категории"
    confirm-label="Сохранить"
    @update:model-value="isOpen = $event"
    @confirm="edit"
  >
    <q-input
      v-model="name"
      label="Название категории"
      outlined
      dense
      autofocus
      :rules="[val => !!val || 'Обязательное поле']"
    />

    <template #actions>
      <q-btn flat no-caps color="negative" icon="delete" label="Удалить" @click="deleteServiceCategory" />
      <q-space />
      <q-btn flat no-caps color="grey-5" label="Отмена" @click="close" />
      <q-btn unelevated no-caps color="secondary" text-color="black" label="Сохранить" @click="edit" />
    </template>
  </LcDialogShell>
</template>

<style scoped></style>
