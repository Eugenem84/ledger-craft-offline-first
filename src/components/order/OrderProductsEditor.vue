<script setup>
// Редактируемый список товаров со склада (вкладка «материалы», Фаза 8, задача 8.1).
// Для товаров правки цены/количества/закупки — тоже черновик: при сохранении заказа строки
// перезаписываются (`useOrderDraftStore.updateOrder`).
//
// «Закупка» — себестоимость на момент продажи (задачи 9.5/9.6): подставляется из последней
// закупки товара (склад отдаёт её как `buy_price`), но её можно поправить. Пусто = «не знаю»:
// маржа по строке тогда не считается (показываем «—»), а не «вся выручка — прибыль».
const props = defineProps({
  products: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['remove', 'update-line'])

const num = value => Number(value || 0)

/** Маржа строки: (цена − закупка) × количество. `null` — закупка неизвестна. */
const lineMargin = line =>
  line?.buy_price == null ? null : (num(line.price) - num(line.buy_price)) * num(line.amount)
</script>

<template>
  <div>
    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">товар</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-qty">кол-во</div>
      <div class="lc-col-num">закупка</div>
      <div class="lc-col-num">сумма</div>
      <div class="lc-col-num">маржа</div>
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
          input-class="text-center"
          :model-value="product.amount"
          @update:model-value="value => emit('update-line', { index, field: 'amount', value })"
        />
      </div>

      <div class="lc-col-num">
        <q-input
          dense
          outlined
          type="number"
          input-class="text-right"
          :model-value="product.buy_price"
          placeholder="—"
          @update:model-value="value => emit('update-line', { index, field: 'buy_price', value })"
        />
      </div>

      <div class="lc-col-num lc-money">
        {{ num(product.price) * num(product.amount) }}
      </div>

      <div
        class="lc-col-num lc-money"
        :class="lineMargin(product) == null ? 'lc-mute' : 'text-positive'"
      >
        {{ lineMargin(product) == null ? '—' : lineMargin(product) }}
      </div>

      <div class="lc-col-del">
        <q-btn flat round dense icon="close" color="negative" @click="emit('remove', index)">
          <q-tooltip class="text-caption">убрать</q-tooltip>
        </q-btn>
      </div>
    </div>
  </div>
</template>
