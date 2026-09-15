// test/order-cost-removed.test.js
//
// Два решения владельца (15.09.2026), которые легко «случайно вернуть»:
//
// 1. Себестоимость из карточки заказа убрана целиком — «закупка/маржа/наценка» в итогах,
//    колонки «закупка» и «маржа» в строках позиций, поле «Закупка» в диалоге материала.
//    Данные `buy_price` при этом продолжают синкаться, а маржа с наценкой живут в
//    «Аналитике» — её мы не трогаем.
// 2. Итог в списке заказов = сумма позиций (`positions_total`), а не снапшот
//    `orders.total_amount`: карточка и «Аналитика» считают из позиций, и снапшот
//    расходился с ними (список показывал старое/нулевое значение).
//
// Тесты структурные (как `order-tabs.test.js`): проверяют контракт компонентов.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

/**
 * Исходник без комментариев: `//`-строки и HTML-комментарии убираем.
 * Комментарии объясняют решение («почему убрали маржу») и упоминают сами слова —
 * проверяем то, что реально рендерится/считается.
 */
const codeOf = source =>
  source
    .split('\n')
    .filter(
      line =>
        !line.trim().startsWith('//') && !line.includes('<!--') && !line.includes('-->')
    )
    .join('\n')

describe('карточка заказа: себестоимости нет, данные при этом живы', () => {
  it('итоги заказа без «закупки/маржи/наценки» и без их пропсов', () => {
    const totals = codeOf(read('src/components/order/OrderTotals.vue'))

    expect(totals).not.toContain('маржа')
    expect(totals).not.toContain('наценка')
    expect(totals).not.toContain('costTotal')
    expect(totals).not.toContain('markupPercent')
    expect(totals).not.toContain('hasUnknownCost')
    // «всего к оплате» остаётся — это то, что нужно мастеру в ордере.
    expect(totals).toContain('всего к оплате')
  })

  it('страница не пробрасывает пропсы себестоимости в панель обзора', () => {
    const page = read('src/pages/OrderDetailsPage.vue')

    expect(page).not.toContain(':cost-total')
    expect(page).not.toContain(':margin=')
    expect(page).not.toContain(':markup-percent')
    expect(page).not.toContain(':has-unknown-cost')

    const panel = read('src/components/order/OrderOverviewPanel.vue')
    expect(panel).not.toContain('costTotal')
    expect(panel).not.toContain('markupPercent')
  })

  it('строки позиций: нет колонок «закупка»/«маржа» и ввода buy_price', () => {
    const rows = [
      'src/components/order/OrderMaterialsBlock.vue',
      'src/components/order/OrderMaterialsEditor.vue',
      'src/components/order/OrderProductsBlock.vue',
      'src/components/order/OrderProductsEditor.vue',
    ]

    for (const file of rows) {
      const source = read(file)

      expect(source, file).not.toContain('>закупка<')
      expect(source, file).not.toContain('>маржа<')
      expect(source, file).not.toContain("field: 'buy_price'")
      expect(source, file).not.toContain('lineMargin')
      // Цена, количество и сумма остаются.
      expect(source, file).toContain('кол-во')
      expect(source, file).toContain('сумма')
    }
  })

  it('диалог материала: поле «Закупка» убрано, количество остаётся целым ≥ 1', () => {
    const dialog = codeOf(read('src/components/order/dialogs/OrderMaterialDialog.vue'))

    expect(dialog).not.toContain('Закупка')
    expect(dialog).not.toContain('buyPrice')
    expect(dialog).toContain('label="Количество"')
    expect(dialog).toContain('min="1"')
    expect(dialog).toContain('step="1"')
    expect(dialog).toContain("emit('submit', { name, price, amount })")
  })

  it('жалоба владельца: в карточке нет слов «маржа» и «наценка» (кроме комментариев)', () => {
    for (const file of [
      'src/components/order/OrderTotals.vue',
      'src/components/order/OrderMaterialsBlock.vue',
      'src/components/order/OrderProductsBlock.vue',
    ]) {
      const source = codeOf(read(file))

      expect(source, file).not.toContain('маржа')
      expect(source, file).not.toContain('наценка')
    }
  })
})

describe('список заказов: итог считается из позиций', () => {
  it('список печатает `positions_total` (с фолбэком на total_amount)', () => {
    const page = read('src/pages/OrdersPage.vue')

    expect(page).toContain('order.positions_total ?? order.total_amount ?? 0')
  })

  it('запрос списка считает сумму позиций и не отправляет её на сервер', () => {
    const queries = read('src/database/queries/orders.js')

    expect(queries).toContain('positions_total')
    expect(queries).toContain('SUM(quantity * sale_price)')
    expect(queries).toContain('SUM(amount * price)')

    const repo = read('src/repositories/ordersRepo.js')
    expect(repo).toContain("'positions_total'")
  })
})
