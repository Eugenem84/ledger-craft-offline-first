<script setup>
// Диалог «добавить ручную позицию» (Фаза 8, задача 8.1).
// Валидация переехала сюда: `submit` уходит только с корректными данными,
// иначе компонент сообщает `invalid` — страница показывает предупреждение.
// Оболочка — общая `LcDialogShell`.
//
// Правка владельца (15.09.2026): количество задаётся шагомером «‹ N ›» — явными
// стрелками влево/вправо, а не системными «вверх/вниз» у числового поля.
import { ref, watch } from 'vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import LcQuantityStepper from 'src/components/ui/LcQuantityStepper.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit', 'invalid'])

/** Черновик формы: название, цена за единицу и количество. */
const emptyForm = () => ({ name: '', price: 0, amount: 1 })

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
  // Количество — целое: «2.5 колеса» не существует (задача 14.19). Отрицательное/ноль
  // считаем ошибкой ввода (как раньше), а не «молча единицей».
  const amount = Math.trunc(Number(form.value.amount))

  if (!name || !(price > 0) || !(amount > 0)) {
    emit('invalid')
    return
  }

  // Себестоимость (`buy_price`) в карточке заказа больше не спрашиваем: маржа живёт
  // в «Аналитике» (правка владельца 15.09.2026). На сервер уезжает `buy_price: null` —
  // «закупка неизвестна», маржа по строке на сервере просто не считается.
  emit('submit', { name, price, amount })
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
          <div class="text-caption lc-mute q-mb-xs">Количество</div>
          <LcQuantityStepper v-model="form.amount" label="Количество" />
        </div>
      </div>
    </div>
  </LcDialogShell>
</template>

