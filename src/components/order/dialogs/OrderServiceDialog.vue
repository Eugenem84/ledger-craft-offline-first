<script setup>
// Диалог «добавить работу» (Фаза 8, задача 8.1): работа создаётся в выбранной
// на вкладке «работы» категории (`useOrderDraftStore.addServiceToCatalog`).
// Оболочка — общая `LcDialogShell`.
import { ref, watch } from 'vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

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
  <LcDialogShell
    :model-value="props.modelValue"
    title="Новая работа"
    subtitle="Работа появится в каталоге выбранной категории"
    confirm-label="Добавить"
    @update:model-value="value => emit('update:modelValue', value)"
    @confirm="submit"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="form.name" label="Название" outlined dense autofocus />
      <q-input v-model.number="form.price" label="Цена, р" type="number" outlined dense />
    </div>
  </LcDialogShell>
</template>

