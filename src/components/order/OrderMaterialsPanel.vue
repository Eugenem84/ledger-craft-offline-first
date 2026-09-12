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
  <q-tab-panel name="materialsChoice" class="q-pa-none">
    <div class="row items-center no-wrap q-pa-md q-gutter-x-sm">
      <div class="col text-caption lc-mute">
        материалы: <span class="lc-money">{{ props.materialsTotal }} р</span>
        · товары: <span class="lc-money">{{ props.productsTotal }} р</span>
      </div>
      <q-btn
        dense
        no-caps
        outline
        color="secondary"
        icon="inventory_2"
        label="со склада"
        @click="emit('add-store-product')"
      />
      <q-btn
        dense
        no-caps
        unelevated
        color="secondary"
        text-color="black"
        icon="add"
        label="материал"
        @click="emit('create-material')"
      />
    </div>

    <OrderMaterialsEditor
      :materials="props.materials"
      :total="props.materialsTotal"
      @remove="index => emit('remove-material', index)"
      @update-line="payload => emit('update-material-line', payload)"
    />

    <OrderProductsEditor
      :products="props.products"
      :total="props.productsTotal"
      @remove="index => emit('remove-product', index)"
      @update-line="payload => emit('update-product-line', payload)"
    />
  </q-tab-panel>
</template>
