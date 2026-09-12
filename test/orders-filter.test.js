// test/orders-filter.test.js
//
// Дефект живого прогона (11.6): тумблер «показывать готовые и оплаченные» скрывал
// даже неоплаченные «готовые» заказы. Причина — строгое `order.paid === false`,
// тогда как в БД `paid` это целое 0/1 (см. `useOrdersStore`/`mappers/orders.js`):
// `0 === false` не выполнялось, а `status !== 'done'` тоже ложно → заказ исчезал.
// Прятать нужно только когда выполнены ОБА условия: «готово» И оплачено.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

import { isOrderDone, isOrderPaid, isOrderVisible } from 'src/utils/orderFilters.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('isOrderPaid терпим к значениям из БД и сервера', () => {
  it.each([
    [1, true],
    ['1', true],
    [true, true],
    [0, false],
    ['0', false],
    [false, false],
    [null, false],
    [undefined, false],
  ])('paid=%p → %p', (paid, expected) => {
    expect(isOrderPaid({ paid })).toBe(expected)
  })
})

describe('тумблер скрывает только «готово И оплачено»', () => {
  const visible = (order, showCompleted = false) => isOrderVisible(order, showCompleted)

  it('неоплаченный готовый заказ (paid = 0) остаётся в списке — это и был баг', () => {
    expect(visible({ status: 'done', paid: 0 })).toBe(true)
  })

  it('готовый и оплаченный скрывается при выключенном тумблере', () => {
    expect(visible({ status: 'done', paid: 1 })).toBe(false)
  })

  it('готовый с paid = false/null тоже видим (оплата не подтверждена)', () => {
    expect(visible({ status: 'done', paid: false })).toBe(true)
    expect(visible({ status: 'done', paid: null })).toBe(true)
  })

  it('незавершённые заказы видимы независимо от оплаты', () => {
    expect(visible({ status: 'waiting', paid: 1 })).toBe(true)
    expect(visible({ status: 'process', paid: 1 })).toBe(true)
  })

  it('включённый тумблер показывает всё', () => {
    expect(visible({ status: 'done', paid: 1 }, true)).toBe(true)
    expect(visible({ status: 'done', paid: 0 }, true)).toBe(true)
  })

  it('isOrderDone — только статус done', () => {
    expect(isOrderDone({ status: 'done' })).toBe(true)
    expect(isOrderDone({ status: 'process' })).toBe(false)
    expect(isOrderDone(null)).toBe(false)
  })
})

describe('OrdersPage использует общий фильтр, а не сравнение с false', () => {
  const page = read('src/pages/OrdersPage.vue')

  it('фильтрация идёт через isOrderVisible', () => {
    expect(page).toContain('isOrderVisible')
    expect(page).toContain('showCompleted')
  })

  it('в странице больше нет ошибочного `paid === false`', () => {
    expect(page).not.toContain('paid === false')
  })
})
