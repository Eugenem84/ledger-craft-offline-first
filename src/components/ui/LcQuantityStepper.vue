<script setup>
// Шагомер количества «‹ 1 ›» (правка владельца 15.09.2026).
//
// Раньше количество задавали `<q-input type="number">`: на десктопе и в Android
// WebView у такого поля появляются системные стрелки **вверх/вниз**, по которым
// пальцем почти не попасть. Теперь у каждой позиции две явные кнопки — **влево**
// (меньше) и **вправо** (больше), а между ними значение, которое всё ещё можно
// набрать руками (числовая клавиатура по `inputmode`).
//
// Правило количества одно на приложение (`src/utils/quantity.js`): целое ≥ 1.
// Компонент только приводит к нему значение — хранение и отправку делает родитель.
import { ref, watch } from 'vue'
import { normalizeQuantity, normalizeQuantityInput } from 'src/utils/quantity.js'

const props = defineProps({
  modelValue: { type: [Number, String], default: 1 },
  /** Нижняя граница: позиции «0 штук» не существует (задача 14.19). */
  min: { type: Number, default: 1 },
  disable: { type: Boolean, default: false },
  /** Растянуть «таблетку» на всю ширину — для диалогов. */
  full: { type: Boolean, default: false },
  /** Подпись для скринридера и тултипов («количество», «количество услуги»). */
  label: { type: String, default: 'количество' },
})

const emit = defineEmits(['update:modelValue'])

/**
 * Что показано в поле. Правки держим локально (чтобы можно было стереть цифру и
 * набрать новую), а наружу уходит уже нормализованное значение.
 */
const text = ref(String(props.modelValue ?? props.min))

watch(
  () => props.modelValue,
  value => {
    const next = String(value ?? props.min)
    if (next !== text.value) text.value = next
  }
)

/** Только цифры: «2.5 колеса» и «−3» в поле не набрать. */
const digitsOnly = value => String(value ?? '').replace(/\D+/g, '')

const onInput = event => {
  text.value = digitsOnly(event.target.value)
  // Пустое поле остаётся пустым (можно набрать заново), всё остальное — целое ≥ 1.
  emit('update:modelValue', normalizeQuantityInput(text.value))
}

/** Уход из поля: пусто/ноль → 1, чтобы наружу всегда уходило целое ≥ 1. */
const onBlur = () => {
  const value = normalizeQuantity(text.value)
  text.value = String(value)
  emit('update:modelValue', value)
}

/** Стрелка влево — «меньше», вправо — «больше»; ниже `min` не опускаемся. */
const step = delta => {
  const next = Math.max(props.min, normalizeQuantity(text.value) + delta)
  text.value = String(next)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="lc-stepper" :class="{ 'lc-stepper--full': props.full }">
    <q-btn
      class="lc-stepper__btn"
      flat
      dense
      round
      icon="chevron_left"
      :disable="props.disable || normalizeQuantity(text) <= props.min"
      :aria-label="`меньше (${props.label})`"
      @click="step(-1)"
    >
      <q-tooltip class="text-caption" :offset="[0, 6]">меньше</q-tooltip>
    </q-btn>

    <input
      class="lc-stepper__value"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :disabled="props.disable"
      :aria-label="props.label"
      :value="text"
      @input="onInput"
      @blur="onBlur"
      @keydown.up.prevent="step(1)"
      @keydown.down.prevent="step(-1)"
      @keydown.enter.prevent="onBlur"
    />

    <q-btn
      class="lc-stepper__btn"
      flat
      dense
      round
      icon="chevron_right"
      :disable="props.disable"
      :aria-label="`больше (${props.label})`"
      @click="step(1)"
    >
      <q-tooltip class="text-caption" :offset="[0, 6]">больше</q-tooltip>
    </q-btn>
  </div>
</template>
