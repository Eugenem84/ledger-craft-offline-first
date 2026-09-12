<script setup>
// Редактируемый список ручных позиций (вкладка «материалы», Фаза 8, задача 8.1).
// Строки — это черновик заказа: правки уезжают в БД при сохранении заказа
// (`useOrderDraftStore.updateOrder`), поэтому компонент ничего не пишет сам.
const props = defineProps({
  materials: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['remove', 'update-line'])
</script>

<template>
  <div class="text-center text-grey">материалы: {{ props.total }}р</div>

  <q-list bordered separator>
    <q-item-label v-if="props.materials.length === 0"> нет материалов</q-item-label>
    <q-item
      v-for="(material, index) in props.materials"
      :key="material.id ?? index"
      class="w-100 justify-between row"
      style="width: 100%"
    >
      <q-item-section class="col-7">
        <q-input
          :model-value="material.name"
          @update:model-value="value => emit('update-line', { index, field: 'name', value })"
        />
      </q-item-section>

      <q-item-section class="col-1">
        <q-input
          :model-value="material.price"
          input-class="text-right"
          @update:model-value="value => emit('update-line', { index, field: 'price', value })"
        />
      </q-item-section>

      <q-item-section class="col-1">
        <q-input
          :model-value="material.amount"
          input-class="text-right"
          prefix="x"
          @update:model-value="value => emit('update-line', { index, field: 'amount', value })"
        />
      </q-item-section>

      <q-item-section class="col-1">
        <q-input :model-value="material.price * material.amount" readonly disable />
      </q-item-section>

      <q-item-section class="col-auto">
        <q-btn icon="delete_forever" @click="emit('remove', index)" color="red" flat round />
      </q-item-section>
    </q-item>
  </q-list>
</template>
