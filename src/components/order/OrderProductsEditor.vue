<script setup>
// Редактируемый список товаров со склада (вкладка «материалы», Фаза 8, задача 8.1).
// Для товаров правки цены/количества — тоже черновик: при сохранении заказа строки
// перезаписываются (`useOrderDraftStore.updateOrder`).
//
// Себестоимость и маржу из карточки заказа убрали (правка владельца 15.09.2026): строки
// редактируют название, цену и количество, а маржа живёт в «Аналитике». Данные `buy_price`
// при этом продолжают синкаться (`useOrderDraftStore`/репозитории не тронуты).
// Количество — целое ≥ 1 (задача 14.19): «−3» и «2.5» не существуют, хранит и отправит
// его стор/репозиторий (`utils/quantity.js`).
import { normalizeQuantity } from 'src/utils/quantity.js'

const props = defineProps({
  products: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['remove', 'update-line'])

const num = value => Number(value || 0)

/** Количество строки: целое ≥ 1 (пустое поле ввода считается единицей). */
const qty = line => normalizeQuantity(line?.amount)
</script>

<template>
  <div>
    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">товар</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-qty">кол-во</div>
      <div class="lc-col-num">сумма</div>
      <div class="lc-col-del"></div>
    </div>

    <div v-if="!props.products.length" class="text-caption lc-mute lc-pad">
      нет товаров со склада — добавьте кнопкой с иконкой склада
    </div>

    <div
      v-for="(product, index) in props.products"
      :key="product.id ?? index"
      class="lc-linerow lc-linerow--edit"
    >
      <div class="lc-col-name">
        <q-input
          dense
          outlined
          :model-value="product.name"
          placeholder="название"
          @update:model-value="value => emit('update-line', { index, field: 'name', value })"
        />
      </div>

      <div class="lc-col-num">
        <q-input
          dense
          outlined
          type="number"
          input-class="text-right"
          :model-value="product.price"
          @update:model-value="value => emit('update-line', { index, field: 'price', value })"
        />
      </div>

      <div class="lc-col-qty">
        <q-input
          dense
          outlined
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          input-class="text-center"
          :model-value="product.amount"
          @update:model-value="value => emit('update-line', { index, field: 'amount', value })"
        />
      </div>

      <div class="lc-col-num lc-money">
        {{ num(product.price) * qty(product) }}
      </div>

      <div class="lc-col-del">
        <q-btn flat round dense icon="close" color="negative" @click="emit('remove', index)">
          <q-tooltip class="text-caption">убрать</q-tooltip>
        </q-btn>
      </div>
    </div>
  </div>
</template>
