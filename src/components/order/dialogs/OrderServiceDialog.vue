<script setup>
// Диалог «добавить работу» (Фаза 8, задача 8.1): работа создаётся в выбранной
// на вкладке «работы» категории (`useOrderDraftStore.addServiceToCatalog`).
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const form = ref({ name: '', price: 0 })

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) form.value = { name: '', price: 0 }
  }
)

const close = () => emit('update:modelValue', false)

const submit = () => {
  emit('submit', { name: form.value.name, price: form.value.price })
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
        <div class="text-h6">Добавление сервиса</div>
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
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Отмена" color="yellow" @click="close" />
        <q-btn flat label="Добавить" color="yellow" @click="submit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
