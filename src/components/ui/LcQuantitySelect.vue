<script setup>
// Выбор количества «каруселью» «N ▾» (правка владельца 26.09.2026).
//
// Было: шагомер «‹ N ›» — две стрелки влево/вправо вокруг значения. В узкой строке
// позиции заказа (на телефоне под название остаётся ~60px) «таблетка» занимала почти
// 100px и выдавливала соседние колонки. Стало: поле показывает только число и каретку,
// а тап открывает карусель (`LcWheelPicker`) — список крутится вверх-вниз, а каждая
// смена числа отмечается коротким вибро-щелчком.
//
// Правило количества одно на приложение (`src/utils/quantity.js`): целое ≥ 1.
// Компонент только приводит к нему значение — хранение и отправку делает родитель.
// Виброотклик — удобство, а не функция: если его нет (браузер, тесты, выключенный
// плагин), карусель работает как обычно.
import { computed, ref } from 'vue'
import { normalizeQuantity } from 'src/utils/quantity.js'
import LcWheelPicker from 'src/components/ui/LcWheelPicker.vue'

const props = defineProps({
  modelValue: { type: [Number, String], default: 1 },
  /** Нижняя граница: позиции «0 штук» не существует (задача 14.19). */
  min: { type: Number, default: 1 },
  /**
   * Верхняя граница карусели. Сотни «спиц на сборку» в мастерской не бывает, а длинный
   * список — это лишние строки и щелчки; при необходимости верх поднимают пропом.
   */
  max: { type: Number, default: 99 },
  disable: { type: Boolean, default: false },
  /** Растянуть поле на всю ширину — для диалогов. */
  full: { type: Boolean, default: false },
  /** Подпись для скринридера и тултипов («количество», «количество услуги»). */
  label: { type: String, default: 'количество' },
})

const emit = defineEmits(['update:modelValue'])

const menuOpen = ref(false)

/** Текущее значение: целое ≥ `min` (правило «0 штук не бывает» — в `utils/quantity.js`). */
const normalized = computed(() => Math.max(props.min, normalizeQuantity(props.modelValue)))

/**
 * Верх карусели: проп, но не ниже текущего значения — иначе уже сохранённое «150 штук»
 * при открытии выглядело бы как «99».
 */
const maxValue = computed(() => Math.max(props.max, normalized.value))

/** Текущее значение для показа: целое в границах карусели. */
const value = computed(() => Math.min(maxValue.value, normalized.value))

const open = () => {
  if (props.disable) return

  menuOpen.value = true
}

/** Наружу всегда уходит целое ≥ 1 (щелчок вибро даёт сама карусель). */
const applyValue = next => {
  emit('update:modelValue', Math.min(maxValue.value, Math.max(props.min, normalizeQuantity(next))))
}
</script>

<template>
  <div class="lc-qty" :class="{ 'lc-qty--full': props.full }">
    <div
      class="lc-qty__field"
      :class="{ 'lc-qty__field--disabled': props.disable }"
      role="button"
      :tabindex="props.disable ? -1 : 0"
      :aria-label="props.label"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      :aria-disabled="props.disable ? 'true' : 'false'"
      @click="open"
      @keydown.enter.prevent="open"
      @keydown.space.prevent="open"
    >
      <span class="lc-qty__value">{{ value }}</span>
      <q-icon class="lc-qty__caret" name="expand_more" size="16px" />
    </div>

    <!-- `no-parent-event`: карусель открываем сами из обработчика поля — у `q-menu`
         нет своего `disable`, а гасить надо именно по нему. Высота — по числу строк
         карусели, поэтому `max-height` не задаём (список короткий и фиксированный). -->
    <q-menu
      v-model="menuOpen"
      no-parent-event
      anchor="bottom middle"
      self="top middle"
      :offset="[0, 6]"
      class="lc-qty__menu"
    >
      <LcWheelPicker
        :model-value="value"
        :min="props.min"
        :max="maxValue"
        :label="props.label"
        @update:model-value="applyValue"
      />
    </q-menu>
  </div>
</template>
