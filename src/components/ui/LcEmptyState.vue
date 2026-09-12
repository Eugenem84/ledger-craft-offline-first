<script setup>
// Пустое состояние вместо «Нет данных».
//
// Показывает, почему список пуст и что сделать дальше; слот — для кнопки действия.
defineProps({
  icon: { type: String, default: 'inbox' },
  title: { type: String, default: 'Пока пусто' },
  hint: { type: String, default: '' },
})
</script>

<template>
  <div class="lc-empty column flex-center text-center q-pa-xl">
    <q-icon :name="icon" size="40px" class="lc-mute q-mb-sm" />
    <div class="lc-muted">{{ title }}</div>
    <div v-if="hint" class="text-caption lc-mute q-mt-xs lc-empty__hint">{{ hint }}</div>
    <div v-if="$slots.default" class="q-mt-md"><slot /></div>
  </div>
</template>

<style scoped>
.lc-empty {
  min-height: 180px;
}

.lc-empty__hint {
  max-width: 280px;
}
</style>
