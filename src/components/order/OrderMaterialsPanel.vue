<script setup>
// Вкладка «материалы» (Фаза 8, задача 8.1): редактируемые ручные позиции и товары
// со склада + кнопки «добавить материал» / «добавить товар со склада».
import OrderMaterialsBlock from 'src/components/order/OrderMaterialsBlock.vue'
import OrderMaterialsEditor from 'src/components/order/OrderMaterialsEditor.vue'
import OrderProductsBlock from 'src/components/order/OrderProductsBlock.vue'
import OrderProductsEditor from 'src/components/order/OrderProductsEditor.vue'

const props = defineProps({
  materials: { type: Array, default: () => [] },
  products: { type: Array, default: () => [] },
  materialsTotal: { type: Number, default: 0 },
  productsTotal: { type: Number, default: 0 },
  /** Правка: в режиме просмотра строки только читаются (вкладка теперь видна всегда). */
  editMode: { type: Boolean, default: false },
  /**
   * Показ кнопки «Добавить товар со склада»: если раздел «склад» выключен флагом
   * профиля (10.3), товары со склада в заказ не добавляются.
   */
  showStoreProducts: { type: Boolean, default: true },
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
  <!-- Панель вкладки живёт в `OrderDetailsPage.vue` (прямой ребёнок `q-tab-panels`). -->
  <div>
    <div class="lc-pad">
      <!-- Главные действия вкладки — заметные кнопки с «+» (раньше были мелкие dense). -->
      <q-btn
        class="full-width"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        icon="add"
        label="Добавить материал"
        @click="emit('create-material')"
      />

      <q-btn
        v-if="props.showStoreProducts"
        class="full-width q-mt-sm"
        outline
        no-caps
        color="secondary"
        icon="inventory_2"
        label="Добавить товар со склада"
        @click="emit('add-store-product')"
      />

      <div class="text-caption lc-mute q-mt-sm">
        материалы: <span class="lc-money">{{ props.materialsTotal }} р</span>
        <template v-if="props.showStoreProducts || props.products.length">
          · товары: <span class="lc-money">{{ props.productsTotal }} р</span>
        </template>
      </div>
    </div>

    <!-- Правка: редактируемые строки. Просмотр: те же данные только для чтения
         (вкладка видна всегда, но менять позиции можно лишь после включения правки). -->
    <template v-if="props.editMode">
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
    </template>

    <template v-else>
      <OrderMaterialsBlock :materials="props.materials" :edit-mode="false" />
      <OrderProductsBlock :products="props.products" :edit-mode="false" />
    </template>
  </div>
</template>
