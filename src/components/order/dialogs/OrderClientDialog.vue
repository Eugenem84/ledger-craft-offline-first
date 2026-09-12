<script setup>
// Диалог «добавить клиента» прямо из заказа (Фаза 8, задача 8.1).
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const form = ref({ name: '', phone: '' })

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) form.value = { name: '', phone: '' }
  }
)

const close = () => emit('update:modelValue', false)

const submit = () => {
  emit('submit', { name: form.value.name, phone: form.value.phone })
  close()
}
</script>

<template>
  <q-dialog
    :model-value="props.modelValue"
    persistent
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <q-card>
      <q-card-section>
        <div class="text-h6">Добавление клиента</div>
        <q-input
          v-model="form.name"
          label-color="yellow"
          color="yellow"
          label="Имя клиента"
          outlined
          class="q-mb-md"
        />
        <q-input
          v-model="form.phone"
          label="телефон"
          label-color="yellow"
          color="yellow"
          type="text"
          outlined
          class="q-mb-md"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Отмена" color="yellow" @click="close" />
        <q-btn flat label="Добавить" color="yellow" @click="submit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
