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
  <div class="text-center text-grey">продукты: {{ props.total }} р</div>

  <q-list bordered separator>
    <q-item-label v-if="props.products.length === 0"> нет материалов</q-item-label>
    <q-item
      v-for="(product, index) in props.products"
      :key="product.id ?? index"
      class="w-100 justify-between row"
      style="width: 100%"
    >
      <q-item-section class="col-4">
        <q-input
          :model-value="product.name"
          @update:model-value="value => emit('update-line', { index, field: 'name', value })"
        />
      </q-item-section>

      <q-item-section class="col-1">
        <q-input
          :model-value="product.price"
          input-class="text-right"
          @update:model-value="value => emit('update-line', { index, field: 'price', value })"
        />
      </q-item-section>

      <q-item-section class="col-1">
        <q-input
          :model-value="product.amount"
          input-class="text-right"
          prefix="x"
          @update:model-value="value => emit('update-line', { index, field: 'amount', value })"
        />
      </q-item-section>

      <q-item-section class="col-1">
        <q-input
          :model-value="product.buy_price"
          input-class="text-right"
          placeholder="закупка"
          @update:model-value="value => emit('update-line', { index, field: 'buy_price', value })"
        />
      </q-item-section>

      <q-item-section class="col-1">
        <q-input :model-value="num(product.price) * num(product.amount)" readonly disable />
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-right" :class="lineMargin(product) == null ? 'text-grey' : 'text-green'">
          {{ lineMargin(product) == null ? '—' : lineMargin(product) }}
        </q-item-label>
      </q-item-section>

      <q-item-section class="col-auto">
        <q-btn icon="delete_forever" @click="emit('remove', index)" color="red" flat round />
      </q-item-section>
    </q-item>
  </q-list>
</template>
