<script setup>
// Список ручных позиций заказа «материалы» — режим просмотра (Фаза 8, задача 8.1).
// Редактируемая версия — `OrderMaterialsEditor.vue` (вкладка «материалы»).
const props = defineProps({
  materials: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])
</script>

<template>
  <q-list bordered separator>
    <q-item-label v-if="props.materials.length === 0">Нет материалов</q-item-label>
    <q-item
      v-for="(material, index) in props.materials"
      :key="material.id ?? index"
      class="w-100 justify-between row"
      style="width: 100%"
    >
      <q-item-section class="col-7">
        <q-item-label class="text-left">
          {{ material.name }}
        </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-right"> {{ material.price }}р </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-center"> х{{ material.amount }} </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-right"> {{ material.price * material.amount }}р </q-item-label>
      </q-item-section>

      <q-item-section class="col-auto" v-if="props.editMode">
        <q-btn icon="delete_forever" @click="emit('remove', index)" color="red" flat round />
      </q-item-section>
    </q-item>
  </q-list>
</template>
