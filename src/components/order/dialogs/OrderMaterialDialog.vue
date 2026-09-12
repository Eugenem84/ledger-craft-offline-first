<script setup>
// Диалог «добавить ручную позицию» (Фаза 8, задача 8.1).
// Валидация переехала сюда: `submit` уходит только с корректными данными,
// иначе компонент сообщает `invalid` — страница показывает предупреждение.
// Оболочка — общая `LcDialogShell`.
import { ref, watch } from 'vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit', 'invalid'])

/** Черновик формы: «закупка» — себестоимость ручной позиции (задачи 9.5/9.6, решение D2). */
const emptyForm = () => ({ name: '', price: 0, amount: 0, buyPrice: 0 })

const form = ref(emptyForm())

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) form.value = emptyForm()
  }
)

const close = () => emit('update:modelValue', false)

const submit = () => {
  const name = String(form.value.name || '').trim()
  const price = Number(form.value.price)
  const amount = Number(form.value.amount)
  const buyPrice = Number(form.value.buyPrice)

  if (!name || !(price > 0) || !(amount > 0)) {
    emit('invalid')
    return
  }

  // Закупка необязательна: `null` означает «не знаю», и маржа по строке не считается
  // (это честнее, чем подставить 0 и показать «всё — прибыль»).
  emit('submit', {
    name,
    price,
    amount,
    buy_price: buyPrice > 0 ? buyPrice : null,
  })
  close()
}
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    title="Новый материал"
    subtitle="Позиция, купленная «по пути» и не учтённая на складе"
    confirm-label="Добавить"
    @update:model-value="value => emit('update:modelValue', value)"
    @confirm="submit"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="form.name" label="Название" outlined dense autofocus />

      <div class="row q-col-gutter-md">
        <div class="col">
          <q-input v-model.number="form.price" label="Цена, р" type="number" outlined dense />
        </div>
        <div class="col">
          <q-input
            v-model.number="form.amount"
            label="Количество"
            type="number"
            outlined dense
          />
        </div>
      </div>

      <q-input
        v-model.number="form.buyPrice"
        label="Закупка за 1 шт., р"
        type="number"
        outlined
        dense
        hint="Необязательно: если оставить пусто/0, маржа по позиции не считается"
      />
    </div>
  </LcDialogShell>
</template>

