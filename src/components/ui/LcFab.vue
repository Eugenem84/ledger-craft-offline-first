<script setup>
// Плавающая кнопка «добавить» — единая позиция над таббаром (см. `.lc-fab`).
//
// Кнопка уезжает в `body` (Teleport): она `position: fixed`, и при переходах между
// разделами страница сдвигается `transform`-ом. У `transform` есть побочный эффект —
// он становится «содержащим блоком» для `position: fixed`, и кнопка прилипала бы к низу
// **контента** (на длинном списке это далеко за экраном), а не к низу экрана. Из `body`
// кнопка не зависит от анимации страницы и остаётся на месте. Появление — короткое
// затухание, чтобы не «выскакивать» раньше содержимого (см. `.lc-fab` в `app.scss`).
defineProps({
  icon: { type: String, default: 'add' },
  label: { type: String, default: '' },
  disable: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['click'])
</script>

<template>
  <Teleport to="body">
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
  </Teleport>
</template>
