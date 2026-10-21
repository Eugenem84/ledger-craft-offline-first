<script setup>
// Диалог «добавить клиента» прямо из заказа (Фаза 8, задача 8.1).
// Оболочка — общая `LcDialogShell` (адаптивная ширина, единые кнопки).
import { computed, ref, watch } from 'vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const form = ref({ name: '', phone: '' })

// Имя обязательно: пустое имя сервер превращает в `null` (`ConvertEmptyStringsToNull`)
// и отклоняет вставку (`23502`). Такая операция висела в очереди и уходила на сервер
// бесконечно (живой лог 19.10.2026), поэтому «Добавить» без имени недоступна.
const canSubmit = computed(() => form.value.name.trim().length > 0)

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) form.value = { name: '', phone: '' }
  }
)

const close = () => emit('update:modelValue', false)

const submit = () => {
  if (!canSubmit.value) return

  emit('submit', { name: form.value.name.trim(), phone: form.value.phone.trim() })
  close()
}
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    title="Новый клиент"
    confirm-label="Добавить"
    :confirm-disable="!canSubmit"
    @update:model-value="value => emit('update:modelValue', value)"
    @confirm="submit"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="form.name" label="Имя клиента" outlined dense autofocus />
      <q-input v-model="form.phone" label="Телефон" type="tel" outlined dense />
    </div>
  </LcDialogShell>
</template>

