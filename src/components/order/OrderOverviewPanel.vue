<script setup>
// Вкладка «все» (Фаза 8, задача 8.1): выбранные работы, ручные позиции, товары,
// итоги и комментарий. Данные приходят пропсами, изменения уходят событиями
// в `useOrderDraftStore` (страница — посредник).
import OrderServicesBlock from 'src/components/order/OrderServicesBlock.vue'
import OrderMaterialsBlock from 'src/components/order/OrderMaterialsBlock.vue'
import OrderProductsBlock from 'src/components/order/OrderProductsBlock.vue'
import OrderTotals from 'src/components/order/OrderTotals.vue'

const props = defineProps({
  services: { type: Array, default: () => [] },
  materials: { type: Array, default: () => [] },
  products: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
  comments: { type: String, default: '' },
  // Универсальный идентификатор объекта (задача 10.9): подпись и видимость — из
  // лексикона/флагов активного профиля.
  equipmentIdentifier: { type: String, default: '' },
  equipmentLabel: { type: String, default: 'идентификатор объекта' },
  showEquipmentIdentifier: { type: Boolean, default: true },
  servicesTotal: { type: Number, default: 0 },
  materialsTotal: { type: Number, default: 0 },
  productsTotal: { type: Number, default: 0 },
  costTotal: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },
  markupPercent: { type: Number, default: null },
  hasUnknownCost: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:comments',
  'update:equipmentIdentifier',
  'remove-service',
  'remove-material',
  'remove-product',
])
</script>

<template>
  <q-tab-panel name="all" style="padding: 0">
    <div>
      <div class="text-center text-grey">работы:</div>

      <OrderServicesBlock
        :services="props.services"
        :edit-mode="props.editMode"
        @remove="index => emit('remove-service', index)"
      />

      <div class="text-grey text-left" v-show="props.servicesTotal > 0">
        всего по работе : {{ props.servicesTotal }}р
      </div>

      <div
        v-if="props.products.length > 0 || props.materials.length > 0"
        class="text-center text-grey"
      >
        материалы:
      </div>

      <OrderMaterialsBlock
        :materials="props.materials"
        :edit-mode="props.editMode"
        @remove="index => emit('remove-material', index)"
      />

      <OrderProductsBlock
        :products="props.products"
        :edit-mode="props.editMode"
        @remove="index => emit('remove-product', index)"
      />

      <OrderTotals
        :services-total="props.servicesTotal"
        :materials-total="props.materialsTotal"
        :products-total="props.productsTotal"
        :cost-total="props.costTotal"
        :margin="props.margin"
        :markup-percent="props.markupPercent"
        :has-unknown-cost="props.hasUnknownCost"
      />
    </div>

    <q-input
      type="textarea"
      :model-value="props.comments"
      @update:model-value="value => emit('update:comments', value)"
      label="комментарии"
      label-color="yellow"
      color="yellow"
      autogrow
      placeholder="Коментариев нет"
      :disable="!props.editMode"
    />

    <!-- Универсальный идентификатор объекта (задача 10.9): VIN / серийник рамы /
         адрес объекта. Подпись и показ поля зависят от активного профиля. -->
    <q-input
      v-if="props.showEquipmentIdentifier"
      :model-value="props.equipmentIdentifier"
      @update:model-value="value => emit('update:equipmentIdentifier', value)"
      :label="props.equipmentLabel"
      label-color="yellow"
      color="yellow"
      outlined
      class="q-mt-md"
      :disable="!props.editMode"
    />
  </q-tab-panel>
</template>
