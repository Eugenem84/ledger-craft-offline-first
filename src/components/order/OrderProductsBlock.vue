<script setup>
// Список товаров со склада в заказе — режим просмотра (Фаза 8, задача 8.1).
// Редактируемая версия — `OrderProductsEditor.vue` (вкладка «материалы»).
const props = defineProps({
  products: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])
</script>

<template>
  <q-list bordered separator>
    <q-item-label v-if="props.products.length === 0">Нет материалов</q-item-label>
    <!-- ⚠️ Раньше здесь был `v-for="product in products"` без `index`, а удаление
         вызывало `products.splice(index, 1)` — падало в рантайме. Исправлено при 8.1. -->
    <q-item
      v-for="(product, index) in props.products"
      :key="product.id ?? index"
      class="w-100 justify-between row"
      style="width: 100%"
    >
      <q-item-section class="col-7">
        <q-item-label class="text-left">
          {{ product.name }}
        </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-right"> {{ product.price }}р </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-center"> х{{ product.amount }} </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-right"> {{ product.price * product.amount }}р </q-item-label>
      </q-item-section>

      <q-item-section class="col-auto" v-if="props.editMode">
        <q-btn icon="delete_forever" @click="emit('remove', index)" color="red" flat round />
      </q-item-section>
    </q-item>
  </q-list>
</template>
