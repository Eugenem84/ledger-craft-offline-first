<script setup>
// Диалог «товар со склада» (Фаза 8, задача 8.1): категория товаров → товар → добавить.
// Категории/товары приходят из стора, выбранные значения уходят наверх событиями.
// Подписи — из лексикона профиля (Фаза 10, задача 10.1): велосипедисту «запчасть».
// Оболочка — общая `LcDialogShell`.
//
// Задача 14.19: в диалоге есть «Количество» — мастер сразу добавляет несколько
// одинаковых товаров (одной строкой заказа с количеством), а не открывает диалог N раз.
// Поле доступно только после выбора товара; количество — целое ≥ 1.
// Правка владельца (15.09.2026): количество задаётся шагомером «‹ N ›» — явными
// стрелками влево/вправо, а не системными «вверх/вниз» у числового поля.
import { ref, watch } from 'vue'
import { useLexicon } from 'src/domain/lexicon.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import LcQuantityStepper from 'src/components/ui/LcQuantityStepper.vue'
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

      <div>
        <div class="text-caption lc-mute q-mb-xs">Количество</div>
        <LcQuantityStepper
          :model-value="amount"
          full
          label="Количество"
          :disable="!props.selectedProduct"
          @update:model-value="setAmount"
        />
        <div class="text-caption lc-mute q-mt-xs">
          {{
            props.selectedProduct
              ? 'Сколько одинаковых — столько и добавим одной строкой'
              : `Сначала выберите ${t('part')}`
          }}
        </div>
      </div>
    </div>
  </LcDialogShell>
</template>

