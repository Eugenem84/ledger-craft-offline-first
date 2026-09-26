// test/wheel-picker.test.js
//
// Карусель количества (`components/ui/LcWheelPicker.vue`, правка владельца 26.09.2026):
// список крутится вверх-вниз, выбранное число стоит в центральной полосе, а каждая смена
// числа отмечается вибро-щелчком. Математику («какая строка в центре», «какое это число»)
// держим в `utils/wheelPicker.js` — её и проверяем без браузера (как `utils/tabSwipe.js`).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  clampWheelValue,
  wheelIndex,
  wheelValueAt,
  wheelValueFromScroll,
  wheelValues,
} from 'src/utils/wheelPicker.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('26.09.2026 карусель количества', () => {
  it('значение и индекс ходят туда-обратно, границы держат рамку', () => {
    expect(clampWheelValue(7, 1, 99)).toBe(7)
    expect(clampWheelValue(0, 1, 99)).toBe(1)
    expect(clampWheelValue(150, 1, 99)).toBe(99)
    expect(clampWheelValue('2.5', 1, 99)).toBe(2)
    expect(clampWheelValue('два колеса', 1, 99)).toBe(1)
    expect(clampWheelValue(null, 1, 99)).toBe(1)

    expect(wheelIndex(1, 1, 99)).toBe(0)
    expect(wheelIndex(36, 1, 99)).toBe(35)
    expect(wheelValueAt(0, 1, 99)).toBe(1)
    expect(wheelValueAt(35, 1, 99)).toBe(36)
    expect(wheelValueAt(-5, 1, 99)).toBe(1)
    expect(wheelValueAt(1000, 1, 99)).toBe(99)
  })

  it('позиция прокрутки превращается в ближайшее число (эффект snap)', () => {
    // Строка 36px: 0 → «1», ровно строка → «2», между строками — ближайшая.
    expect(wheelValueFromScroll(0, 36, 1, 99)).toBe(1)
    expect(wheelValueFromScroll(36, 36, 1, 99)).toBe(2)
    expect(wheelValueFromScroll(50, 36, 1, 99)).toBe(2)
    expect(wheelValueFromScroll(60, 36, 1, 99)).toBe(3)
    expect(wheelValueFromScroll(35 * 36, 36, 1, 99)).toBe(36)
    expect(wheelValueFromScroll(9999 * 36, 36, 1, 99)).toBe(99)
    // Мусор не должен давать `NaN` (иначе наружу уехало бы «NaN штук»).
    expect(wheelValueFromScroll(NaN, 36, 1, 99)).toBe(1)
    expect(wheelValueFromScroll(100, 0, 1, 99)).toBe(1)
  })

  it('строки карусели — все числа от минимума до максимума', () => {
    expect(wheelValues(1, 3)).toEqual([1, 2, 3])
    expect(wheelValues(1, 1)).toEqual([1])
    expect(wheelValues(1, 99)).toHaveLength(99)
  })

  it('карусель — нативный скролл со snap, и каждая строка щёлкает вибро', () => {
    const wheel = read('src/components/ui/LcWheelPicker.vue')

    expect(wheel).toContain('class="lc-wheel__scroller"')
    expect(wheel).toContain('@scroll.passive="onScroll"')
    expect(wheel).toContain('tickHaptic')
    expect(wheel).toContain('wheelValueFromScroll')
    // Число уходит наружу сразу, а не «по кнопке»: карусель не держит значение у себя.
    expect(wheel).toContain("emit('update:modelValue', value)")
  })

  it('в стилях высота строки одна и для разметки, и для маски (плюс snap и «туман»)', () => {
    const css = read('src/css/app.scss')

    expect(css).toContain('--lc-wheel-row: 36px')
    // «Доводка» строки к центру и опора строки на сетку прокрутки — только в CSS.
    expect(css).toContain('scroll-snap-type: y mandatory')
    expect(css).toContain('scroll-snap-align: center')
    expect(css).toContain('.lc-wheel__row--active')
    expect(css).toContain('mask-image: linear-gradient(')
  })
})
