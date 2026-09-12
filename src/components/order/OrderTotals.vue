<script setup>
// Итоги заказа (Фаза 8, задача 8.1): сумма по позициям и «всего к оплате».
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
  <div class="text-grey text-left" v-show="itemsTotal > 0">
    всего по материалам: {{ itemsTotal }}р
  </div>

  <div class="text-grey text-center display: flex">
    <div>всего к оплате:</div>
    <div class="text-green">{{ grandTotal }}</div>
    р
  </div>
</template>
