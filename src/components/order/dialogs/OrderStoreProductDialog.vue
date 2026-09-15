<script setup>
// Диалог «товар со склада» (Фаза 8, задача 8.1): категория товаров → товар → добавить.
// Категории/товары приходят из стора, выбранные значения уходят наверх событиями.
// Подписи — из лексикона профиля (Фаза 10, задача 10.1): велосипедисту «запчасть».
// Оболочка — общая `LcDialogShell`.
//
// Задача 14.19: в диалоге есть «Количество» — мастер сразу добавляет несколько
// одинаковых товаров (одной строкой заказа с количеством), а не открывает диалог N раз.
// Поле доступно только после выбора товара; количество — целое ≥ 1.
import { ref, watch } from 'vue'
import { useLexicon } from 'src/domain/lexicon.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import { normalizeQuantity, normalizeQuantityInput } from 'src/utils/quantity.js'

const { t } = useLexicon()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  categories: { type: Array, default: () => [] },
  products: { type: Array, default: () => [] },
  selectedCategory: { type: [String, Number], default: null },
  selectedProduct: { type: Object, default: null },
})

const emit = defineEmits([
  'update:modelValue',
  'update:selectedCategory',
  'update:selectedProduct',
  'submit',
])

/** Количество добавляемых штук: целое ≥ 1 (`''` — поле очищено, при отправке станет 1). */
const amount = ref(1)

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) amount.value = 1
  }
)

const setAmount = value => {
  amount.value = normalizeQuantityInput(value)
}

const submit = () => {
  emit('submit', { amount: normalizeQuantity(amount.value) })

  // Окно закрываем, как остальные диалоги заказа («добавить материал/работу»):
  // позиция уже в черновике, повторное открытие — новое действие.
  emit('update:modelValue', false)
  amount.value = 1
}
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    :title="`${t('part')} со склада`"
    confirm-label="Добавить"
    :confirm-disable="!props.selectedProduct"
    @update:model-value="value => emit('update:modelValue', value)"
    @confirm="submit"
  >
    <div class="q-gutter-y-md">
      <q-select
        :model-value="props.selectedCategory"
        :options="props.categories"
        option-value="id"
        option-label="name"
        emit-value
        map-options
        outlined
        dense
        label="Категория"
        color="secondary"
        @update:model-value="value => emit('update:selectedCategory', value)"
      />

      <q-select
        :model-value="props.selectedProduct"
        :options="props.products"
        option-label="name"
        outlined
        dense
        :label="t('part')"
        color="secondary"
        :disable="!props.selectedCategory"
        @update:model-value="value => emit('update:selectedProduct', value)"
      />

      <q-input
        :model-value="amount"
        label="Количество"
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        outlined
        dense
        color="secondary"
        :disable="!props.selectedProduct"
        :hint="
          props.selectedProduct
            ? 'Сколько одинаковых — столько и добавим одной строкой'
            : `Сначала выберите ${t('part')}`
        "
        @update:model-value="setAmount"
      />
    </div>
  </LcDialogShell>
</template>

