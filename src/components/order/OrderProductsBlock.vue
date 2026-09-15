<script setup>
// Список товаров со склада в заказе — режим просмотра (Фаза 8, задача 8.1).
// Редактируемая версия — `OrderProductsEditor.vue` (вкладка «материалы»).
//
// Себестоимость и маржу из карточки заказа убрали (правка владельца 15.09.2026):
// в ордере — состав и сумма, маржа живёт в «Аналитике». Данные `buy_price` при этом
// продолжают синкаться, просто здесь не показываются.
// Количество — целое ≥ 1 (задача 14.19): «−3 шт» или «2.5 колеса» в заказе быть не может.
import { normalizeQuantity } from 'src/utils/quantity.js'

const props = defineProps({
  products: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])

const num = value => Number(value || 0)

/** Количество строки для чтения: целое ≥ 1. */
const qty = line => normalizeQuantity(line?.amount)
</script>

<template>
  <div>
    <div v-if="!props.products.length" class="text-caption lc-mute lc-pad">
      товаров из склада пока нет — добавьте их на вкладке «материалы»
    </div>

    <template v-else>
      <div class="lc-linerow lc-linerow--head">
        <div class="lc-col-name">товар</div>
        <div class="lc-col-num">цена</div>
        <div class="lc-col-qty">кол-во</div>
        <div class="lc-col-num">сумма</div>
        <div v-if="props.editMode" class="lc-col-del"></div>
      </div>

      <div
        v-for="(product, index) in props.products"
        :key="product.id ?? index"
        class="lc-linerow"
      >
        <div class="lc-col-name ellipsis">{{ product.name }}</div>
        <div class="lc-col-num lc-money">{{ product.price }} р</div>
        <div class="lc-col-qty">× {{ qty(product) }}</div>
        <div class="lc-col-num lc-money">{{ num(product.price) * qty(product) }} р</div>
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
