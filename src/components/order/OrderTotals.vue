<script setup>
// Итоги заказа (Фаза 8, задача 8.1): сумма по позициям, «всего к оплате» и маржа.
//
// Маржа/наценка — задачи 9.5/9.6: маржа = выручка − себестоимость позиций (закупка
// товаров со склада и ручных позиций; у работ себестоимости нет). Если в какой-то
// позиции закупка не указана, `hasUnknownCost` — маржа «частичная», и мы это пишем.
import { computed } from 'vue'

const props = defineProps({
  servicesTotal: { type: Number, default: 0 },
  materialsTotal: { type: Number, default: 0 },
  productsTotal: { type: Number, default: 0 },
  costTotal: { type: Number, default: 0 },
  margin: { type: Number, default: 0 },
  markupPercent: { type: Number, default: null },
  hasUnknownCost: { type: Boolean, default: false },
})

const itemsTotal = computed(() => props.materialsTotal + props.productsTotal)
const grandTotal = computed(() => itemsTotal.value + props.servicesTotal)
const markupText = computed(() =>
  props.markupPercent == null ? '—' : `${props.markupPercent > 0 ? '+' : ''}${props.markupPercent}%`
)
</script>

<template>
  <div class="text-grey text-left" v-show="itemsTotal > 0">
    всего по материалам: {{ itemsTotal }}р
  </div>

  <div class="text-grey text-center display: flex">
    <div>всего к оплате:</div>
    <div class="text-green">{{ grandTotal }}</div>
    р
  </div>

  <!-- Маржа заказа (9.5/9.6): сходится с суммой позиций — закупка × количество -->
  <div v-show="costTotal > 0" class="text-grey text-center">
    <div class="row justify-center items-center q-gutter-x-md">
      <span>закупка: <span class="text-orange">{{ costTotal }}</span> р</span>
      <span>маржа: <span :class="margin >= 0 ? 'text-green' : 'text-negative'">{{ margin }}</span> р</span>
      <span>наценка: {{ markupText }}</span>
    </div>
    <div v-if="hasUnknownCost" class="text-caption text-orange">
      часть позиций без закупки — маржа посчитана без их себестоимости
    </div>
  </div>
</template>
