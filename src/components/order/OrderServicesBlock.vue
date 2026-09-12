<script setup>
// Список выбранных работ в заказе (Фаза 8, задача 8.1).
const props = defineProps({
  services: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])
</script>

<template>
  <q-list bordered separator>
    <q-item-label v-if="props.services.length === 0">Нет сервисов</q-item-label>
    <q-item
      v-for="(service, index) in props.services"
      :key="service.id ?? index"
      class="w-100 justify-between"
      style="width: 100%"
    >
      <q-item-section>
        <q-item-label class="text-left">
          {{ service.service }}
        </q-item-label>
      </q-item-section>

      <q-item-section>
        <q-item-label class="text-right"> {{ service.price }}р </q-item-label>
      </q-item-section>

      <q-item-section class="col-auto" v-if="props.editMode">
        <q-btn icon="delete_forever" @click="emit('remove', index)" color="red" flat round />
      </q-item-section>
    </q-item>
  </q-list>
</template>
