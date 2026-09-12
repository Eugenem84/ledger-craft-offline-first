<script setup>
// Плавающая кнопка «добавить» — единая позиция над таббаром (см. `.lc-fab`).
defineProps({
  icon: { type: String, default: 'add' },
  label: { type: String, default: '' },
  disable: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['click'])
</script>

<template>
  <q-btn
    class="lc-fab"
    color="secondary"
    text-color="black"
    unelevated
    :icon="icon"
    :label="label"
    :round="!label"
    :disable="disable"
    :loading="loading"
    :padding="label ? '10px 18px' : '14px'"
    @click="emit('click')"
  >
    <q-tooltip v-if="label" class="text-caption">{{ label }}</q-tooltip>
  </q-btn>
</template>
