<script setup>
// Диалог «добавить модель техники» прямо из заказа (Фаза 8, задача 8.1).
// Оболочка — общая `LcDialogShell` (адаптивная ширина, единые кнопки).
import { ref, watch } from 'vue'
import { useLexicon } from 'src/domain/lexicon.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const { t } = useLexicon()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const form = ref({ name: '' })

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) form.value = { name: '' }
  }
)

const close = () => emit('update:modelValue', false)

const submit = () => {
  emit('submit', { name: form.value.name })
  close()
}
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    :title="`Новая модель: ${t('model')}`"
    confirm-label="Добавить"
    @update:model-value="value => emit('update:modelValue', value)"
    @confirm="submit"
  >
    <q-input v-model="form.name" :label="`Название: ${t('model')}`" outlined dense autofocus />
  </LcDialogShell>
</template>

