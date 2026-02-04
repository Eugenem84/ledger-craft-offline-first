<script setup>
import {ref} from 'vue'
import {useSpecializationsStore} from "stores/useSpecializationsStore.js";
import { useClientsStore } from 'stores/useClientsStore.js'

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
