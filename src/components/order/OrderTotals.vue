<script setup>
// Итоги заказа (Фаза 8, задача 8.1): сумма по позициям и «всего к оплате».
//
// Себестоимость / маржа / наценка из карточки заказа убраны (правка владельца
// 15.09.2026): мастеру в ордере нужна сумма к оплате, а маржа с наценкой живут в
// «Аналитике». Данные `buy_price` при этом продолжают синкаться и считаться —
// просто в ордере не показываются.
import { computed } from 'vue'

const props = defineProps({
  servicesTotal: { type: Number, default: 0 },
  materialsTotal: { type: Number, default: 0 },
  productsTotal: { type: Number, default: 0 },
})

const itemsTotal = computed(() => props.materialsTotal + props.productsTotal)
const grandTotal = computed(() => itemsTotal.value + props.servicesTotal)
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
