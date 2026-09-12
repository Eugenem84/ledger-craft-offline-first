<script setup>
// Диалог «товар со склада» (Фаза 8, задача 8.1): категория товаров → товар → добавить.
// Категории/товары приходят из стора, выбранные значения уходят наверх событиями.
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

const close = () => emit('update:modelValue', false)
</script>

<template>
  <q-dialog
    :model-value="props.modelValue"
    persistent
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <q-card>
      <q-card-section>
        <div class="text-h6">Добавление товара со склада</div>
        <q-select
          :model-value="props.selectedCategory"
          :options="props.categories"
          option-value="id"
          option-label="name"
          emit-value
          map-options
          label="Выберите категорию"
          @update:model-value="value => emit('update:selectedCategory', value)"
          label-color="yellow"
        />
        <q-select
          :model-value="props.selectedProduct"
          :options="props.products"
          option-label="name"
          label="выберите товар"
          label-color="yellow"
          @update:model-value="value => emit('update:selectedProduct', value)"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="отмена" color="yellow" @click="close" />
        <q-btn flat label="добавить" color="yellow" @click="emit('submit')" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
