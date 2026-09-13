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
  <div class="lc-totals lc-pad">
    <div class="lc-totals-row">
      <span class="lc-muted">работы</span>
      <span class="lc-money">{{ servicesTotal }} р</span>
    </div>

    <div v-show="itemsTotal > 0" class="lc-totals-row">
      <span class="lc-muted">материалы и товары</span>
      <span class="lc-money">{{ itemsTotal }} р</span>
    </div>

    <q-separator dark class="q-my-sm" />

    <div class="lc-totals-row lc-totals-row--grand">
      <span>всего к оплате</span>
      <span class="lc-money text-positive">{{ grandTotal }} р</span>
    </div>

    <!-- Маржа заказа (9.5/9.6): сходится с суммой позиций — закупка × количество -->
    <template v-if="costTotal > 0">
      <div class="lc-totals-row">
        <span class="lc-muted">закупка</span>
        <span class="lc-money text-orange">{{ costTotal }} р</span>
      </div>
      <div class="lc-totals-row">
        <span class="lc-muted">маржа</span>
        <span class="lc-money" :class="margin >= 0 ? 'text-positive' : 'text-negative'">
          {{ margin }} р
        </span>
      </div>
      <div class="lc-totals-row">
        <span class="lc-muted">наценка</span>
        <span class="lc-money">{{ markupText }}</span>
      </div>
      <div v-if="hasUnknownCost" class="text-caption text-orange q-mt-xs">
        часть позиций без закупки — маржа посчитана без их себестоимости
      </div>
    </template>
  </div>
</template>

<style scoped>
.lc-totals-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;
}

.lc-totals-row--grand {
  font-size: 16px;
  font-weight: 700;
}
</style>
