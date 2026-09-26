<script setup>
// «Карусель» чисел для выбора количества (правка владельца 26.09.2026: «хотел, чтобы
// список выпадал и его можно было крутить вверх-вниз как карусель, а при кручении —
// вибро-щелчки, оповещающие о смене количества»).
//
// Как устроено: обычный вертикальный скролл со `scroll-snap: y mandatory` — выбранная
// строка всегда оказывается в центральной полосе, а крайние строки «уезжают в туман»
// (маска). Позиция считается по `scrollTop` (`utils/wheelPicker.js`): как только строка
// в центре сменилась, наружу уходит новое значение и короткий щелчок `tickHaptic` —
// поэтому «один щелчок = одно число».
//
// Почему не библиотека-пикер: зависимости в проект добавляем осознанно, а нативный
// scroll-snap + подсчёт строки дают тот же эффект на Android WebView, который у нас целевой.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tickHaptic } from 'src/utils/haptics.js'
import {
  clampWheelValue,
  wheelIndex,
  wheelValueAt,
  wheelValueFromScroll,
  wheelValues,
} from 'src/utils/wheelPicker.js'

const props = defineProps({
  modelValue: { type: Number, default: 1 },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 99 },
  /** Сколько строк видно одновременно; нечётное — выбранная строка по центру. */
  visible: { type: Number, default: 5 },
  /** Подпись для скринридера («количество», «количество услуги»). */
  label: { type: String, default: 'количество' },
})

const emit = defineEmits(['update:modelValue'])

/**
 * Высота строки, px. ⚠️ Должна совпадать с `--lc-wheel-row` в `app.scss`: по ней
 * считается и прокрутка, и центральная полоса.
 */
const ROW_HEIGHT = 36

const scroller = ref(null)

/** Число, на котором стоит карусель. Отдельно от `modelValue`, чтобы эмит не дёргал скролл. */
const current = ref(clampWheelValue(props.modelValue, props.min, props.max))

const values = computed(() => wheelValues(props.min, props.max))

const height = computed(() => props.visible * ROW_HEIGHT)

/** Поля сверху и снизу: без них первая и последняя строки не вставали бы в центр. */
const spacer = computed(() => Math.round(((props.visible - 1) / 2) * ROW_HEIGHT))

/** Прокрутка к числу: без анимации при открытии, с анимацией при внешнем изменении. */
function scrollTo(value, smooth = false) {
  const node = scroller.value

  if (node === null) return

  node.scrollTo({ top: wheelIndex(value, props.min, props.max) * ROW_HEIGHT, behavior: smooth ? 'smooth' : 'auto' })
}

let frameId = 0

onBeforeUnmount(() => {
  if (frameId !== 0) cancelAnimationFrame(frameId)
})

/**
 * Прокрутка: строка в центре сменилась — отдаём число наружу и «щёлкаем».
 * Считаем через `requestAnimationFrame`: `scroll` срабатывает десятки раз в секунду.
 */
function onScroll() {
  if (frameId !== 0) return

  frameId = requestAnimationFrame(() => {
    frameId = 0

    const node = scroller.value
    if (node === null) return

    const value = wheelValueFromScroll(node.scrollTop, ROW_HEIGHT, props.min, props.max)
    if (value === current.value) return

    current.value = value
    emit('update:modelValue', value)
    tickHaptic()
  })
}

onMounted(() => {
  // Меню рендерит содержимое в портал и позиционирует его после кадра — ставим прокрутку
  // на нужную строку в следующем кадре, когда у «окна» уже есть размеры.
  nextTick(() => {
    requestAnimationFrame(() => scrollTo(current.value))
  })
})

/** Значение поменяли извне (например, открыли список на другом числе) — доводим карусель. */
watch(
  () => props.modelValue,
  value => {
    const next = clampWheelValue(value, props.min, props.max)

    if (next === current.value) return

    current.value = next
    scrollTo(next, true)
  }
)

/** Клавиатура (десктоп/отладка): стрелки вверх-вниз — та же «карусель». */
function onKeydown(event) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

  event.preventDefault()

  const delta = event.key === 'ArrowDown' ? 1 : -1
  const next = wheelValueAt(wheelIndex(current.value, props.min, props.max) + delta, props.min, props.max)

  if (next === current.value) return

  current.value = next
  emit('update:modelValue', next)
  tickHaptic()
  scrollTo(next, true)
}
</script>

<template>
  <div class="lc-wheel" :style="{ height: `${height}px` }">
    <div
      ref="scroller"
      class="lc-wheel__scroller"
      role="listbox"
      tabindex="0"
      data-autofocus
      :aria-label="props.label"
      @scroll.passive="onScroll"
      @keydown="onKeydown"
    >
      <div :style="{ height: `${spacer}px` }" />

      <div
        v-for="value in values"
        :key="value"
        class="lc-wheel__row"
        :class="{ 'lc-wheel__row--active': value === current }"
        role="option"
        :aria-selected="value === current"
      >
        {{ value }}
      </div>

      <div :style="{ height: `${spacer}px` }" />
    </div>

    <!-- «Окно» выбора: рамки сверху и снизу от строки, стоящей в центре. -->
    <div class="lc-wheel__band" :style="{ top: `${spacer}px`, height: `${ROW_HEIGHT}px` }" />
  </div>
</template>
