<script setup>
import { ref } from 'vue'
import { useCategoriesStore } from 'stores/useCategoriesStore.js'
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useQuasar } from 'quasar'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const $q = useQuasar()
const categoriesStore = useCategoriesStore()
// Не создаем экземпляр store здесь, чтобы он не был "заморожен"
// const specializationStore = useSpecializationsStore()

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
  // Получаем актуальный экземпляр store прямо перед использованием
  const specializationStore = useSpecializationsStore()
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
  <LcDialogShell
    :model-value="isOpen"
    title="Новая категория"
    confirm-label="Сохранить"
    @update:model-value="isOpen = $event"
    @confirm="addNew"
  >
    <q-input v-model="name" label="Название категории" outlined dense autofocus />
  </LcDialogShell>
</template>

<style scoped></style>
