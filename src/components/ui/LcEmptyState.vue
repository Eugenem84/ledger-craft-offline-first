<script setup>
// Пустое состояние вместо «Нет данных».
//
// Показывает, почему список пуст и что сделать дальше; слот — для кнопки действия.
// Подсказка (`hint`) выводится общим компонентом `LcHint`: её можно выключить в настройках,
// а включённая показывается уменьшенным шрифтом (правка владельца 26.09.2026).
import LcHint from 'src/components/ui/LcHint.vue'

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
    <LcHint v-if="hint" class="q-mt-xs lc-empty__hint">{{ hint }}</LcHint>
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
