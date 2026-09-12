<script setup>
// Вкладка «материалы» (Фаза 8, задача 8.1): редактируемые ручные позиции и товары
// со склада + кнопки «добавить материал» / «добавить товар со склада».
import OrderMaterialsEditor from 'src/components/order/OrderMaterialsEditor.vue'
import OrderProductsEditor from 'src/components/order/OrderProductsEditor.vue'

const props = defineProps({
  materials: { type: Array, default: () => [] },
  products: { type: Array, default: () => [] },
  materialsTotal: { type: Number, default: 0 },
  productsTotal: { type: Number, default: 0 },
})

const emit = defineEmits([
  'remove-material',
  'remove-product',
  'update-material-line',
  'update-product-line',
  'create-material',
  'add-store-product',
])
</script>

<template>
  <q-tab-panel name="materialsChoice" style="padding: 0">
    <OrderMaterialsEditor
      :materials="props.materials"
      :total="props.materialsTotal"
      @remove="index => emit('remove-material', index)"
      @update-line="payload => emit('update-material-line', payload)"
    />

    <!-- Плавающая кнопка добавления нового материала -->
    <q-btn
      icon="add"
      round
      class="fab bg-yellow text-black"
      @click="emit('create-material')"
      size="20px"
    />

    <OrderProductsEditor
      :products="props.products"
      :total="props.productsTotal"
      @remove="index => emit('remove-product', index)"
      @update-line="payload => emit('update-product-line', payload)"
    />

    <q-btn
      icon="storage"
      round
      class="bg-yellow text-black"
      size="18"
      @click="emit('add-store-product')"
      style="position: fixed; bottom: 100px; right: 16px; z-index: 1000"
    />
  </q-tab-panel>
</template>

<style scoped>
/* Кнопка была в разметке страницы, где и жил класс `.fab` (scoped-стили родителя
   не достают до вложенных элементов дочерних компонентов) — 8.1. */
.fab {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
}
</style>
