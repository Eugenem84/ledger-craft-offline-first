<script setup>
import { computed, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useClientsStore } from 'stores/useClientsStore.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const $q = useQuasar()
const specializationStore = useSpecializationsStore()
const clientsStore = useClientsStore()

const isOpen = ref(false)
const name = ref('')
const phone = ref('')

/**
 * Имя обязательно: без него запись локально сохранится с пустой строкой, а сервер
 * (Laravel `ConvertEmptyStringsToNull` + `NOT NULL` в PostgreSQL) отклонит её
 * навсегда — операция будет крутиться в очереди (живой лог 19.10.2026).
 */
const canSubmit = computed(() => name.value.trim().length > 0)

function open(){
  name.value = ''
  phone.value = ''
  isOpen.value = true
}

function close(){
  isOpen.value = false
}

defineExpose({open})

const addNew = async () => {
  if (!canSubmit.value) {
    $q.notify({ type: 'warning', message: 'Укажите имя клиента', position: 'top', timeout: 2000 })
    return
  }

  try {
    // Получаем актуальный ID выбранной специализации из стора
    const selectedSpecializationId = specializationStore.selectedId;

    if (!selectedSpecializationId) {
      console.error("Специализация не выбрана. Невозможно добавить клиента.");
      // В будущем здесь можно будет показать уведомление пользователю
      return
    }

    const newClient = {
      name: name.value.trim(),
      phone: phone.value.trim(),
      specialization_id: selectedSpecializationId
    };
    // Вызываем экшен стора, который сделает всю работу (обновит UI, сохранит в БД, поставит в очередь)
    await clientsStore.add(newClient);

    name.value = ''
    phone.value = ''
    close()
  } catch (err) {
    console.error('ошибка добавления клиента: ', err)
    $q.notify({
      type: 'negative',
      message: err?.message || 'Не удалось добавить клиента',
      position: 'top',
      timeout: 4000,
    })
  }
}

</script>

<template>
  <LcDialogShell
    :model-value="isOpen"
    title="Новый клиент"
    confirm-label="Добавить"
    :confirm-disable="!canSubmit"
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
