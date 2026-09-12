<script setup>
// Редактируемый список товаров со склада (вкладка «материалы», Фаза 8, задача 8.1).
// Для товаров правки цены/количества — тоже черновик: при сохранении заказа строки
// перезаписываются (`useOrderDraftStore.updateOrder`).
const props = defineProps({
  products: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['remove', 'update-line'])
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
      <q-item-section class="col-7">
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
        <q-input :model-value="product.price * product.amount" readonly disable />
      </q-item-section>

      <q-item-section class="col-auto">
        <q-btn icon="delete_forever" @click="emit('remove', index)" color="red" flat round />
      </q-item-section>
    </q-item>
  </q-list>
</template>
