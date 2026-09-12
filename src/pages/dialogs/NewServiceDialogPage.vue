<script setup>
import { ref } from 'vue'
import { useServicesStore } from 'stores/useServicesStore.js'
import { useQuasar } from 'quasar'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const $q = useQuasar()
const servicesStore = useServicesStore()

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
  <LcDialogShell
    :model-value="isOpen"
    title="Новая работа"
    confirm-label="Сохранить"
    @update:model-value="isOpen = $event"
    @confirm="addNew"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="name" label="Название работы" outlined dense autofocus />
      <q-input v-model="price" label="Цена, р" type="number" outlined dense />
    </div>
  </LcDialogShell>
</template>
