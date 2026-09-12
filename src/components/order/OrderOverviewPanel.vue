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
  <q-tab-panel name="all" class="q-pa-none">
    <!-- В режиме просмотра вкладки «работа/материалы» скрыты — подсказываем, как их открыть. -->
    <div
      v-if="!props.editMode"
      class="row items-center no-wrap q-px-md q-pt-md q-gutter-x-xs text-caption lc-mute"
    >
      <q-icon name="info" size="14px" />
      <span>Чтобы добавить работы, материалы или товары — нажмите «Изменить» сверху.</span>
    </div>

    <OrderServicesBlock
      :services="props.services"
      :edit-mode="props.editMode"
      @remove="index => emit('remove-service', index)"
    />

    <div
      v-if="props.servicesTotal > 0"
      class="row items-baseline justify-between q-px-md q-pt-sm text-caption lc-mute"
    >
      <span>итого по работам</span>
      <span class="lc-money">{{ props.servicesTotal }} р</span>
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

    <q-separator dark class="q-my-sm" />

    <OrderTotals
      :services-total="props.servicesTotal"
      :materials-total="props.materialsTotal"
      :products-total="props.productsTotal"
      :cost-total="props.costTotal"
      :margin="props.margin"
      :markup-percent="props.markupPercent"
      :has-unknown-cost="props.hasUnknownCost"
    />

    <div class="q-px-md q-pb-md q-gutter-y-md">
      <q-input
        type="textarea"
        :model-value="props.comments"
        @update:model-value="value => emit('update:comments', value)"
        label="комментарии"
        color="secondary"
        autogrow
        outlined
        placeholder="например: «клиент просил перезвонить в среду»"
        :disable="!props.editMode"
      />

      <!-- Универсальный идентификатор объекта (задача 10.9): VIN / серийник рамы /
           адрес объекта. Подпись и показ поля зависят от активного профиля. -->
      <q-input
        v-if="props.showEquipmentIdentifier"
        :model-value="props.equipmentIdentifier"
        @update:model-value="value => emit('update:equipmentIdentifier', value)"
        :label="props.equipmentLabel"
        color="secondary"
        outlined
        :disable="!props.editMode"
      />
    </div>
  </q-tab-panel>
</template>
