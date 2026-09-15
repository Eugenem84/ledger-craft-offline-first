// test/order-quantity-editmode.test.js
//
// Правило правки позиций заказа: количество работ и товаров меняется **только** в
// режиме правки («Редактировать»). Простой просмотр — чтение: поля количества
// неактивны или не рендерятся вовсе.
//
// Плюс правило 14.19: количество задаётся маленьким полем (не «двойным тапом»), а
// диалог «товар со склада» закрывается по «Добавить», как остальные диалоги заказа.
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

    expect(block).toMatch(/<q-input\s+v-if="props\.editMode"/)
    expect(block).toContain("emit('update-line', { index, field: 'quantity', value })")
  })

  it('материалы и товары: редактируемые строки видны только при правке', () => {
    const panel = read('src/components/order/OrderMaterialsPanel.vue')

    expect(panel).toMatch(/<template v-if="props\.editMode">\s*<OrderMaterialsEditor/)
    expect(panel).toMatch(/<template v-if="props\.editMode">[\s\S]*<OrderProductsEditor/)
    expect(panel).toMatch(/<template v-else>[\s\S]*<OrderMaterialsBlock/)
  })

  it('страница заказа передаёт режим правки в панель работ', () => {
    const page = read('src/pages/OrderDetailsPage.vue')
    const start = page.indexOf('<OrderServicesPanel')
    const tag = page.slice(start, page.indexOf('/>', start))

    expect(start).toBeGreaterThan(-1)
    expect(tag).toContain(':edit-mode="editMode"')
    expect(tag).toContain(':chosen="services"')
  })

  it('диалог «товар со склада»: количество полем, окно закрывается по «Добавить»', () => {
    const dialog = read('src/components/order/dialogs/OrderStoreProductDialog.vue')

    expect(dialog).toContain("emit('submit', { amount:")
    expect(dialog).toContain("emit('update:modelValue', false)")
    // «Добавить» без выбранного товара — не молчаливое закрытие, а неактивная кнопка.
    expect(dialog).toContain(':confirm-disable="!props.selectedProduct"')
    // Количество доступно только после выбора товара.
    expect(dialog).toContain(':disable="!props.selectedProduct"')
  })

  it('количество — целое ≥ 1 и в полях: min/step/inputmode на вводах количества', () => {
    const inputs = [
      'src/components/order/OrderServicesPanel.vue',
      'src/components/order/OrderServicesBlock.vue',
      'src/components/order/OrderMaterialsEditor.vue',
      'src/components/order/OrderProductsEditor.vue',
      'src/components/order/dialogs/OrderStoreProductDialog.vue',
      'src/components/order/dialogs/OrderMaterialDialog.vue',
    ]

    for (const file of inputs) {
      const source = read(file)

      expect(source, file).toContain('min="1"')
      expect(source, file).toContain('step="1"')
      expect(source, file).toContain('inputmode="numeric"')
    }
  })
})
