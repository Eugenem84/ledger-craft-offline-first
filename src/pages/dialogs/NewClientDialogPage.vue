<script setup>
import { ref } from 'vue'
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useClientsStore } from 'stores/useClientsStore.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const specializationStore = useSpecializationsStore()
const clientsStore = useClientsStore()

const isOpen = ref(false)
const name = ref('')
const phone = ref('')

function open(){
  isOpen.value = true
}

function close(){
  isOpen.value = false
}

defineExpose({open})

const addNew = async () => {
  try {
    // Получаем актуальный ID выбранной специализации из стора
    const selectedSpecializationId = specializationStore.selectedId;

    if (!selectedSpecializationId) {
      console.error("Специализация не выбрана. Невозможно добавить клиента.");
      // В будущем здесь можно будет показать уведомление пользователю
      return;
    }

    const newClient = {
      name: name.value,
      phone: phone.value,
      specialization_id: selectedSpecializationId
    };
    // Вызываем экшен стора, который сделает всю работу (обновит UI, сохранит в БД, поставит в очередь)
    await clientsStore.add(newClient);

    name.value = ''
    phone.value = ''
    close()
  } catch (err) {
    console.error('ошибка добавления клиента: ', err)
  }
}

</script>

<template>
  <LcDialogShell
    :model-value="isOpen"
    title="Новый клиент"
    confirm-label="Добавить"
    @update:model-value="isOpen = $event"
    @confirm="addNew"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="name" label="Имя клиента" outlined dense autofocus />
      <q-input v-model="phone" label="Телефон" type="tel" outlined dense />
    </div>
  </LcDialogShell>
</template>

<style scoped></style>
