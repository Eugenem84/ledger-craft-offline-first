<script setup>
// Диалог «добавить ручную позицию» (Фаза 8, задача 8.1).
// Валидация переехала сюда: `submit` уходит только с корректными данными,
// иначе компонент сообщает `invalid` — страница показывает предупреждение.
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit', 'invalid'])

const form = ref({ name: '', price: 0, amount: 0 })

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) form.value = { name: '', price: 0, amount: 0 }
  }
)

const close = () => emit('update:modelValue', false)

const submit = () => {
  const name = String(form.value.name || '').trim()
  const price = Number(form.value.price)
  const amount = Number(form.value.amount)

  if (!name || !(price > 0) || !(amount > 0)) {
    emit('invalid')
    return
  }

  emit('submit', { name, price, amount })
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
        <div class="text-h6">Добавление материала</div>
        <q-input
          v-model="form.name"
          label-color="yellow"
          color="yellow"
          label="Название"
          outlined
          class="q-mb-md"
        />
        <q-input
          v-model.number="form.price"
          label="Цена"
          label-color="yellow"
          color="yellow"
          type="number"
          outlined
          class="q-mb-md"
        />
        <q-input
          v-model.number="form.amount"
          label="Количество"
          label-color="yellow"
          color="yellow"
          type="number"
          outlined
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Отмена" color="yellow" @click="close" />
        <q-btn flat label="Добавить" color="yellow" @click="submit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
