// test/quantity-select.test.js
//
// Правка владельца 26.09.2026: количество выбирают «каруселью» по тапу (`LcQuantitySelect`
// → `LcWheelPicker`), а не стрелками «‹ N ›» — те занимали почти 100px и в узкой строке
// позиции выдавливали название.
//
// Тест структурный (как `order-quantity-editmode.test.js`): проверяем контракт
// компонента — поле-«таблетка» с числом и кареткой, карусель внутри меню,
// правило «целое ≥ 1» из общего `utils/quantity.js`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('26.09.2026 количество — карусель вместо стрелок', () => {
  it('в поле количества нет стрелок: число, каретка и карусель по тапу', () => {
    const select = read('src/components/ui/LcQuantitySelect.vue')

    expect(select).not.toContain('chevron_left')
    expect(select).not.toContain('chevron_right')

    // Тап по полю открывает меню, внутри — карусель чисел.
    expect(select).toContain('<q-menu')
    expect(select).toContain('no-parent-event')
    expect(select).toContain('<LcWheelPicker')
    expect(select).toContain('name="expand_more"')

    // Верх карусели и правило «целое ≥ 1» (общий `utils/quantity.js`).
    expect(select).toContain('max: { type: Number, default: 99 }')
    expect(select).toContain('normalizeQuantity')
  })

  it('старый шагомер со стрелками удалён', () => {
    expect(() => read('src/components/ui/LcQuantityStepper.vue')).toThrow()
  })

  it('карусель — общий компонент, а не разметка внутри поля количества', () => {
    const wheel = read('src/components/ui/LcWheelPicker.vue')

    // Список строк рисует сама карусель, а не `q-list` в поле количества.
    expect(wheel).toContain('v-for="value in values"')
    expect(wheel).toContain('role="listbox"')
  })
})
