// test/order-quantity-editmode.test.js
//
// Правило правки позиций заказа: количество работ и товаров меняется **только** в
// режиме правки («Редактировать»). Простой просмотр — чтение: поле количества
// не рендерится вовсе.
//
// Плюс правило 14.19: количество задаётся явным органом (не «двойным тапом»), а
// диалог «товар со склада» закрывается по «Добавить», как остальные диалоги заказа.
// Правка владельца 26.09.2026: количество выбирают из выпадающего списка по тапу
// (`LcQuantitySelect`) — стрелки «‹ N ›» убраны, они занимали почти 100px и
// выдавливали название позиции.
//
// Тесты структурные — как `order-tabs.test.js` и `pages-layout.test.js`: проверяем
// контракт компонентов (`editMode`, `v-if`/`:disable`), чтобы «просмотр вдруг снова
// стал редактируемым» падал здесь, а не на живом прогоне у мастера.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

/** Компоненты, где количество выбирают из списка (`LcQuantitySelect`). */
const QUANTITY_USERS = [
  'src/components/order/OrderServicesPanel.vue',
  'src/components/order/OrderServicesBlock.vue',
  'src/components/order/OrderPartsEditor.vue',
  'src/components/order/dialogs/OrderStoreProductDialog.vue',
  'src/components/order/dialogs/OrderMaterialDialog.vue',
  // Приход товара — тоже количество, поэтому и здесь список, а не числовое поле.
  'src/pages/dialogs/ArrivalProductDialogPage.vue',
]

describe('14.19 количество работ/товаров — только в режиме правки', () => {
  it('каталог работ: количество — только у выбранной работы и только при правке', () => {
    const panel = read('src/components/order/OrderServicesPanel.vue')

    expect(panel).toContain('editMode: { type: Boolean, default: false }')
    expect(panel).toContain('v-if="isChosen(service) && props.editMode"')
    expect(panel).toContain("emit('update-quantity', { service, value })")
    // Работа без количества не добавляется: выбор = одна штука, количество — правка.
    expect(panel).toContain("emit('add', { service })")
  })

  it('список работ в заказе: поле количества рендерится только при правке', () => {
    const block = read('src/components/order/OrderServicesBlock.vue')

    expect(block).toMatch(/<LcQuantitySelect\s+v-if="props\.editMode"/)
    expect(block).toContain("emit('update-line', { index, field: 'quantity', value })")
  })

  it('товары: редактируемый список виден только при правке, в просмотре — чтение', () => {
    const panel = read('src/components/order/OrderPartsPanel.vue')

    expect(panel).toMatch(/<template v-if="props\.editMode">\s*<OrderPartsEditor/)
    expect(panel).toMatch(/<template v-else>[\s\S]*<OrderPartsBlock/)
  })

  it('страница заказа передаёт режим правки в панель работ', () => {
    const page = read('src/pages/OrderDetailsPage.vue')
    const start = page.indexOf('<OrderServicesPanel')
    const tag = page.slice(start, page.indexOf('/>', start))

    expect(start).toBeGreaterThan(-1)
    expect(tag).toContain(':edit-mode="editMode"')
    expect(tag).toContain(':chosen="services"')
  })

  it('диалог «товар со склада»: количество из списка, окно закрывается по «Добавить»', () => {
    const dialog = read('src/components/order/dialogs/OrderStoreProductDialog.vue')

    expect(dialog).toContain("emit('submit', { amount:")
    expect(dialog).toContain("emit('update:modelValue', false)")
    // «Добавить» без выбранного товара — не молчаливое закрытие, а неактивная кнопка.
    expect(dialog).toContain(':confirm-disable="!props.selectedProduct"')
    // Количество доступно только после выбора товара.
    expect(dialog).toContain(':disable="!props.selectedProduct"')
  })

  it('количество выбирают из списка по тапу — стрелок влево/вправо нет', () => {
    for (const file of QUANTITY_USERS) {
      const source = read(file)

      expect(source, file).toContain('<LcQuantitySelect')
      // Числового поля количества с системными стрелками больше нет.
      expect(source, file).not.toContain('inputmode="numeric"')
    }

    // Правило «целое ≥ 1», список чисел и виброотклик живут в самом компоненте.
    const select = read('src/components/ui/LcQuantitySelect.vue')

    expect(select).toContain('min: { type: Number, default: 1 }')
    expect(select).not.toContain('chevron_left')
    expect(select).not.toContain('chevron_right')
    expect(select).toContain('normalizeQuantity')
    expect(select).toContain('<LcWheelPicker')
  })
})
