<script setup>
// Список товаров со склада в заказе — режим просмотра (Фаза 8, задача 8.1).
// Редактируемая версия — `OrderProductsEditor.vue` (вкладка «материалы»).
//
// «Закупка» и маржа по строке — задачи 9.5/9.6; `—` означает «закупка не указана».
const props = defineProps({
  products: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])

const num = value => Number(value || 0)

const lineMargin = line =>
  line?.buy_price == null ? null : (num(line.price) - num(line.buy_price)) * num(line.amount)
</script>

<template>
  <div>
    <div v-if="!props.products.length" class="text-caption lc-mute q-pa-md">
      товаров из склада пока нет — добавьте их на вкладке «материалы»
    </div>

    <template v-else>
      <div class="lc-linerow lc-linerow--head">
        <div class="lc-col-name">товар</div>
        <div class="lc-col-num">цена</div>
        <div class="lc-col-qty">кол-во</div>
        <div class="lc-col-num">закупка</div>
        <div class="lc-col-num">сумма</div>
        <div class="lc-col-num">маржа</div>
        <div v-if="props.editMode" class="lc-col-del"></div>
      </div>

      <div
        v-for="(product, index) in props.products"
        :key="product.id ?? index"
        class="lc-linerow"
      >
        <div class="lc-col-name ellipsis">{{ product.name }}</div>
        <div class="lc-col-num lc-money">{{ product.price }} р</div>
        <div class="lc-col-qty">× {{ product.amount }}</div>
        <div class="lc-col-num lc-mute">{{ product.buy_price ?? '—' }}</div>
        <div class="lc-col-num lc-money">{{ num(product.price) * num(product.amount) }} р</div>
        <div
          class="lc-col-num"
          :class="lineMargin(product) == null ? 'lc-mute' : 'text-positive'"
        >
          {{ lineMargin(product) == null ? '—' : `${lineMargin(product)} р` }}
        </div>
        <div v-if="props.editMode" class="lc-col-del">
          <q-btn
            flat
            round
            dense
            icon="close"
            color="negative"
            @click="emit('remove', index)"
          >
            <q-tooltip class="text-caption">убрать</q-tooltip>
          </q-btn>
        </div>
      </div>
    </template>
  </div>
</template>
