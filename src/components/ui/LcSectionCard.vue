<script setup>
// Секция-карточка: заголовок-eyebrow, опциональные действия и слот контента.
//
// Раньше «Другие» и аналитика собирали блоки из `text-subtitle2` + `q-separator`
// в одну простыню. Теперь секции одинаковы на всех экранах.
defineProps({
  title: { type: String, default: '' },
  icon: { type: String, default: '' },
  /** Убирает внутренние отступы у слота (когда внутри список/таблица). */
  flush: { type: Boolean, default: false },
})
</script>

<template>
  <section class="lc-card">
    <header v-if="title" class="row items-center no-wrap lc-pad-x q-pt-md q-pb-sm">
      <q-icon v-if="icon" :name="icon" size="18px" class="lc-mute q-mr-sm" />
      <div class="lc-eyebrow">{{ title }}</div>
      <q-space />
      <slot name="actions" />
    </header>
    <div :class="flush || !title ? '' : 'lc-pad-x q-pb-md'">
      <slot />
    </div>
  </section>
</template>
