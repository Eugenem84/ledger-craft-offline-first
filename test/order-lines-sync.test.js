// test/order-lines-sync.test.js
//
// Фаза 21, задача 21.27: сохранение заказа больше не множит позиции.
//
// Живой отчёт `a8df6cf1` (21.10.2026, dev): «двойные работы в ордере», а на сервере
// оказалось 4 копии одного товара и одной ручной позиции. Причина — сохранение делало
// «удалить всё и добавить заново»: каждое сохранение меняло `uuid_id` строк, а копии,
// накопленные повторными выгрузками, уезжали на сервер все сразу.
//
// Проверяем `syncLines` каждого репозитория: совпадающие строки не трогаются (ноль
// операций), дубли в черновике схлопываются, лишние удаляются, новые добавляются.
import { beforeEach, describe, expect, it } from 'vitest'

import { setupTestDb } from './helpers/testDb.js'
import db from 'src/database/db.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'
import * as materialsRepo from 'src/repositories/materialsRepo.js'
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'
import { uniqueBy } from 'src/utils/uniqueLines.js'

const ORDER = 'order-21-27'

beforeEach(async () => {
  await setupTestDb()

  await db.execute(
    `INSERT INTO orders (id, specialization_id, user_order_number, status, paid, created_at, updated_at)
     VALUES (?, NULL, 1, 'waiting', 0, 1, 1)`,
    [ORDER]
  )

  await db.execute(
    `INSERT INTO products (id, server_id, name, base_sale_price) VALUES (?, ?, ?, ?)`,
    ['prod-1', 5, 'Покрышка', 500]
  )

  await db.execute(
    `INSERT INTO categories (id, server_id, category_name) VALUES (?, ?, ?)`,
    ['cat-1', 71, 'Монтаж']
  )

  await db.execute(
    `INSERT INTO services (id, server_id, category_id, service, price) VALUES (?, ?, ?, ?, ?)`,
    ['svc-1', 225, 'cat-1', 'Прокладка трассы', 2500]
  )
})

const count = async (table) => {
  const row = await db.queryOne(`SELECT COUNT(*) AS count FROM ${table}`)
  return Number(row.count)
}

describe('21.27 сохранение заказа не множит позиции', () => {
  it('uniqueBy схлопывает дубли по ключу', () => {
    const list = [
      { id: 'a', price: 1 },
      { id: 'a', price: 2 },
      { id: 'b', price: 3 },
    ]

    expect(uniqueBy(list, item => item.id)).toEqual([
      { id: 'a', price: 1 },
      { id: 'b', price: 3 },
    ])
  })

  it('товары: 4 копии в черновике → одна строка и ни одной операции', async () => {
    await db.execute(
      `INSERT INTO order_product (id, server_id, order_id, product_id, sale_price, quantity, buy_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['line-1', 19, ORDER, 'prod-1', 500, 3, null]
    )

    const draft = Array.from({ length: 4 }, () => ({
      id: 'prod-1',
      product_id: 'prod-1',
      amount: 3,
      price: 500,
      buy_price: null,
    }))

    await orderProductRepo.syncLines(ORDER, draft)

    expect(await count('order_product')).toBe(1)
    // Ничего не изменилось — очередь пуста (раньше здесь было 4 вставки).
    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('товары: изменённое количество пересоздаёт ровно одну строку', async () => {
    await db.execute(
      `INSERT INTO order_product (id, server_id, order_id, product_id, sale_price, quantity, buy_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['line-1', 19, ORDER, 'prod-1', 500, 3, null]
    )

    await orderProductRepo.syncLines(ORDER, [
      { id: 'prod-1', product_id: 'prod-1', amount: 2, price: 450, buy_price: null },
    ])

    const lines = await db.query('SELECT * FROM order_product WHERE order_id = ?', [ORDER])

    expect(lines).toHaveLength(1)
    expect(Number(lines[0].quantity)).toBe(2)
    expect(Number(lines[0].sale_price)).toBe(450)
    expect(await operationsRepo.countPending()).toBeGreaterThan(0)
  })

  it('товары: позиция, убранная из черновика, удаляется', async () => {
    await db.execute(
      `INSERT INTO order_product (id, server_id, order_id, product_id, sale_price, quantity, buy_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['line-1', 19, ORDER, 'prod-1', 500, 3, null]
    )

    await orderProductRepo.syncLines(ORDER, [])

    expect(await count('order_product')).toBe(0)
  })

  it('работы: дубли схлопываются, совпадающая строка не создаёт операций', async () => {
    await db.execute(
      `INSERT INTO order_service (id, order_id, service_id, sale_price, quantity)
       VALUES (?, ?, ?, ?, ?)`,
      ['line-svc', ORDER, 'svc-1', 2500, 1]
    )

    const draft = Array.from({ length: 4 }, () => ({
      id: 'svc-1',
      price: 2500,
      sale_price: 2500,
      quantity: 1,
    }))

    await orderServiceRepo.syncLines(ORDER, draft)

    expect(await count('order_service')).toBe(1)
    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('ручные позиции: одинаковые строки не дублируются', async () => {
    await db.execute(
      `INSERT INTO materials (id, order_id, name, price, amount, buy_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['mat-1', ORDER, 'покрышка', 400, 2, null]
    )

    const draft = Array.from({ length: 4 }, () => ({
      id: 'mat-1',
      name: 'покрышка',
      price: 400,
      amount: 2,
      buy_price: null,
    }))

    await materialsRepo.syncLines(ORDER, draft)

    expect(await count('materials')).toBe(1)
    expect(await operationsRepo.countPending()).toBe(0)
  })
})
