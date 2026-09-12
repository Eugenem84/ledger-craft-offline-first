<script setup>
// Список ручных позиций заказа «материалы» — режим просмотра (Фаза 8, задача 8.1).
// Редактируемая версия — `OrderMaterialsEditor.vue` (вкладка «материалы»).
//
// Показываем и маржу по строке (задачи 9.5/9.6): `—`, если закупка не указана —
// цифра «вся выручка» была бы неправдой.
const props = defineProps({
  materials: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])

const num = value => Number(value || 0)

const lineMargin = line =>
  line?.buy_price == null ? null : (num(line.price) - num(line.buy_price)) * num(line.amount)
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
      <q-item-section class="col-4">
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
        <q-item-label class="text-right text-grey"> {{ material.buy_price ?? '—' }} </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-right"> {{ num(material.price) * num(material.amount) }}р </q-item-label>
      </q-item-section>

      <q-item-section class="col-1">
        <q-item-label class="text-right" :class="lineMargin(material) == null ? 'text-grey' : 'text-green'">
          {{ lineMargin(material) == null ? '—' : `${lineMargin(material)}р` }}
        </q-item-label>
      </q-item-section>

      <q-item-section class="col-auto" v-if="props.editMode">
        <q-btn icon="delete_forever" @click="emit('remove', index)" color="red" flat round />
      </q-item-section>
    </q-item>
  </q-list>
</template>
