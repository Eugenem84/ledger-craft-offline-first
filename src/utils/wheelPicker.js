// src/utils/wheelPicker.js
//
// «Чистая» математика карусели чисел (`components/ui/LcWheelPicker.vue`, правка владельца
// 26.09.2026). Здесь нет Vue и DOM: компонент только крутит скролл и рисует строки, а
// «какая строка сейчас в центре» и «какое это число» считают эти функции — их проверяет
// `test/wheel-picker.test.js` без браузера (как `utils/tabSwipe.js`).

/**
 * Целое в границах карусели. Мусор (`NaN`, пусто) → минимум: правило «количество ≥ 1»
 * живёт в `utils/quantity.js`, а здесь только рамка карусели.
 *
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampWheelValue(value, min, max) {
  const number = Math.trunc(Number(value))

  if (!Number.isFinite(number)) return min

  return Math.min(max, Math.max(min, number))
}

/**
 * Индекс строки в карусели: `0` — минимум.
 *
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function wheelIndex(value, min, max) {
  return clampWheelValue(value, min, max) - min
}

/**
 * Значение по индексу строки.
 *
 * @param {unknown} index
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function wheelValueAt(index, min, max) {
  const number = Math.trunc(Number(index))

  return clampWheelValue(min + (Number.isFinite(number) ? Math.max(0, number) : 0), min, max)
}

/**
 * Значение по позиции прокрутки: берём **ближайшую** строку — это то же, что делает
 * `scroll-snap: y mandatory`, и так положение пальца между строками не даёт «полутонов».
 *
 * @param {number} scrollTop прокрутка контейнера, px
 * @param {number} rowHeight высота строки, px
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function wheelValueFromScroll(scrollTop, rowHeight, min, max) {
  const height = Number(rowHeight)
  const top = Number(scrollTop)

  if (!(height > 0) || !Number.isFinite(top)) return min

  return wheelValueAt(Math.round(top / height), min, max)
}

/**
 * Все значения карусели по порядку (строки списка).
 *
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
export function wheelValues(min, max) {
  const list = []

  for (let value = min; value <= max; value += 1) list.push(value)

  return list
}
