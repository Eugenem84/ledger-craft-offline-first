<script setup>
// Диалог «товар со склада» (Фаза 8, задача 8.1): категория товаров → товар → добавить.
// Категории/товары приходят из стора, выбранные значения уходят наверх событиями.
// Подписи — из лексикона профиля (Фаза 10, задача 10.1): велосипедисту «запчасть».
// Оболочка — общая `LcDialogShell`.
import { useLexicon } from 'src/domain/lexicon.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

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
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    :title="`${t('part')} со склада`"
    confirm-label="Добавить"
    @update:model-value="value => emit('update:modelValue', value)"
    @confirm="emit('submit')"
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
    </div>
  </LcDialogShell>
</template>

