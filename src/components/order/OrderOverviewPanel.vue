<script setup>
// Вкладка «все» (Фаза 8, задача 8.1): выбранные работы, товары (склад + покупки),
// итоги и комментарий. Данные приходят пропсами, изменения уходят событиями
// в `useOrderDraftStore` (страница — посредник).
import { computed } from 'vue'
import LcHint from 'src/components/ui/LcHint.vue'
import OrderServicesBlock from 'src/components/order/OrderServicesBlock.vue'
import OrderPartsBlock from 'src/components/order/OrderPartsBlock.vue'
import OrderTotals from 'src/components/order/OrderTotals.vue'

const props = defineProps({
  services: { type: Array, default: () => [] },
  /** Единый список «товары»: `{ source, index, ...line }` (склад и покупки вместе). */
  parts: { type: Array, default: () => [] },
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
})

const emit = defineEmits([
  'update:comments',
  'update:equipmentIdentifier',
  'remove-service',
  'remove-part',
  'update-service-line',
])

/** Есть ли в заказе позиции: работы или товары (склад/покупки). */
const hasPositions = computed(() => props.services.length + props.parts.length > 0)
</script>

<template>
  <!-- Панель вкладки живёт в `OrderDetailsPage.vue` (прямой ребёнок `q-tab-panels`) —
       здесь только содержимое. -->
  <div>
    <!-- Вкладки «работа»/«товары» видны всегда; в режиме просмотра напоминаем,
         что добавить позиции можно там же — правка включится автоматически. Подсказка
         нужна только **пустому** заказу: как только появились работы или товары,
         она мешает читать список (правка владельца 15.09.2026). -->
    <LcHint
      v-if="!props.editMode && !hasPositions"
      icon="info"
      class="lc-pad-x q-pt-md"
    >
      Добавить работы и товары можно на вкладках выше — правка включится сама,
      а изменения сохранит кнопка «Сохранить».
    </LcHint>

    <OrderServicesBlock
      :services="props.services"
      :edit-mode="props.editMode"
      @remove="index => emit('remove-service', index)"
      @update-line="payload => emit('update-service-line', payload)"
    />

    <div
      v-if="props.servicesTotal > 0"
      class="row items-baseline justify-between lc-pad-x q-pt-sm text-caption lc-mute"
    >
      <span>итого по работам</span>
      <span class="lc-money">{{ props.servicesTotal }} р</span>
    </div>

    <OrderPartsBlock :parts="props.parts" />

    <q-separator dark class="q-my-sm" />

    <OrderTotals
      :services-total="props.servicesTotal"
      :materials-total="props.materialsTotal"
      :products-total="props.productsTotal"
    />

    <div class="lc-pad-x q-pb-md q-gutter-y-md">
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
  </div>
</template>
