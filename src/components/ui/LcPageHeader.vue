<script setup>
// Заголовок «плотной» страницы: eyebrow + подпись + слот действий.
//
// Раньше каждый экран рисовал свой заголовок сам (`style="letter-spacing:0.35em"`,
// `text-center`, `#1c1c1c`) — теперь это один компонент.
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
})
</script>

<template>
  <div class="lc-pageheader row items-center no-wrap q-mb-sm">
    <q-icon v-if="icon" :name="icon" size="22px" class="lc-mute q-mr-sm" />
    <div class="col">
      <div class="lc-eyebrow">{{ title }}</div>
      <div v-if="subtitle" class="text-caption lc-mute">{{ subtitle }}</div>
    </div>
    <slot name="actions" />
  </div>
</template>

<style scoped>
.lc-pageheader {
  min-height: 36px;
}
</style>
