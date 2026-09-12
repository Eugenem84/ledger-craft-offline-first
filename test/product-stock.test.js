// test/product-stock.test.js
//
// Задача 9.3: остаток и цены. Проверяем, что склад реально читает три таблицы
// (`product_stocks` — остаток, `buy_product_prices` — закупка, `sales_products_prices` —
// последняя цена продажи), а цена продажи фиксируется в момент продажи товара и уходит
// синком (раньше `sales_products_prices` не заполнялась вообще, и склад показывал
// `product.quantity` без источника).
//
// БД — настоящий sql.js в памяти (`test/helpers/testDb.js`), сеть — фейковый сервер
// `SyncController` (`test/helpers/fakeServer.js`).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import api from 'src/services/api'
import syncService from 'src/services/syncService.js'
import storage from 'src/utils/storage.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'
import * as salesProductPricesRepo from 'src/repositories/salesProductPricesRepo.js'
import * as incomingProductsRepo from 'src/repositories/incomingProductsRepo.js'
import { useProductsStore } from 'src/stores/useProductsStore.js'

let server

/** Мастерская: специализация → категория товаров → товар (+ клиент и заказ). */
async function seedWorkshop() {
  const specializationId = await specializationsRepo.save({ name: 'Склад' })
  const productCategoryId = await productCategoriesRepo.save({
    name: 'Фильтры',
    specialization_id: specializationId,
  })
  const productId = await productsRepo.save({
    name: 'Фильтр',
    base_sale_price: 1000,
    product_category_id: productCategoryId,
  })
  const clientId = await clientsRepo.save({ name: 'Иван' })
  const orderId = await ordersRepo.save({ client_id: clientId, total_amount: 1000 })

  const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [productId])

  return { productCategoryId, productId, product, clientId, orderId }
}

/** Ставит серверный id записи (как будто она уже уехала в синк). */
async function markServerId(table, localId, serverId) {
  await db.execute(`UPDATE ${table} SET server_id = ? WHERE id = ?`, [serverId, localId])
}

/** Что стоит в очереди синка: `[таблица, тип]` в порядке постановки. */
async function queuedOperations() {
  const rows = await db.query('SELECT * FROM operations ORDER BY created_at ASC')
  return rows.map(row => ({ table: row.table, type: row.type }))
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())

  storage.setItem('auth_token', 'test-token')

  server = createFakeServer()
  vi.spyOn(api, 'send').mockImplementation(payload => server.send(payload))
  vi.spyOn(api, 'fetchUpdates').mockImplementation(args => server.fetchUpdates(args))

  syncService.syncing = false
  syncService.status = {
    online: true,
    syncing: false,
    lastError: null,
    consecutiveFailures: 0,
    nextRetryAt: 0,
    pendingCount: 0,
    requiresAuth: false,
  }
  syncService._listeners = new Set()
})

afterEach(() => {
  storage.removeItem('auth_token')
  vi.restoreAllMocks()
})

describe('9.3 склад: остаток и цены', () => {
  it('склад показывает остаток, закупку и последнюю цену продажи', async () => {
    const { productCategoryId, product, orderId, productId } = await seedWorkshop()

    // Приход: +4 шт. по 250 ₽ — остаток и закупочная цена (задача 9.2).
    await incomingProductsRepo.receiveArrival({
      product,
      byPrice: 250,
      arrivalQuantity: 4,
    })

    // Продажа: товар ушёл в заказ по 900 ₽ — это и есть «последняя цена продажи» (9.3).
    await orderProductRepo.add(orderId, productId, 2, 900)

    const rows = await productsRepo.getByCategoryId(productCategoryId)
    const row = rows.find(item => item.id === productId)

    expect(row).toMatchObject({
      quantity: 4,
      buy_price: 250,
      base_sale_price: 1000,
      last_sale_price: 900,
    })

    // Список склада в сторе получает то же самое (страница склад показывает эти колонки).
    const store = useProductsStore()
    await store.loadByCategoryId(productCategoryId)

    expect(store.items[0]).toMatchObject({ quantity: 4, buy_price: 250, last_sale_price: 900 })
  })

  it('цена продажи пишется в историю и убирается вместе со строкой заказа', async () => {
    const { orderId, productId } = await seedWorkshop()

    await orderProductRepo.add(orderId, productId, 1, 1200)

    const sales = await salesProductPricesRepo.getByOrderId(orderId)
    expect(sales).toHaveLength(1)
    expect(sales[0]).toMatchObject({ sale_price: 1200, product_id: productId, order_id: orderId })

    expect(await queuedOperations()).toContainEqual({
      table: 'sales_products_prices',
      type: 'insert',
    })

    // Товар убрали из заказа — история не должна «врать» (и операция не должна уехать).
    await orderProductRepo.removeByOrderId(orderId)

    expect(await salesProductPricesRepo.getByOrderId(orderId)).toHaveLength(0)
    expect((await queuedOperations()).some(op => op.table === 'sales_products_prices')).toBe(false)
  })

  it('удаление уже синхронизированной продажи ставит delete-операцию', async () => {
    const { orderId, productId } = await seedWorkshop()

    await orderProductRepo.add(orderId, productId, 1, 1000)

    // Строка заказа и запись о продаже уже уехали в синк.
    const [line] = await db.query('SELECT * FROM order_product WHERE order_id = ?', [orderId])
    await markServerId('order_product', line.id, 555)

    const [sale] = await db.query('SELECT * FROM sales_products_prices WHERE order_id = ?', [orderId])
    await markServerId('sales_products_prices', sale.id, 777)

    await orderProductRepo.removeByOrderId(orderId)

    const operations = await queuedOperations()
    expect(operations).toContainEqual({ table: 'sales_products_prices', type: 'delete' })
    expect(await db.query('SELECT * FROM sales_products_prices')).toHaveLength(0)
  })
})

describe('9.3 склад: цены продажи в синке', () => {
  it('продажа уезжает с серверными id заказа и товара и получает server_id', async () => {
    const { orderId, productId } = await seedWorkshop()

    // Заказ и товар уже уехали в синк: очередь пуста, серверные id проставлены.
    await db.execute('DELETE FROM operations')
    await markServerId('orders', orderId, 77)
    await markServerId('products', productId, 42)

    await orderProductRepo.add(orderId, productId, 1, 1500)
    await syncService.sync()

    const sent = server.received.find(entry => entry.table === 'sales_products_prices')
    expect(sent.payload.order_id).toBe(77)
    expect(sent.payload.product_id).toBe(42)
    expect(sent.payload.sale_price).toBe(1500)

    const [sale] = await db.query('SELECT * FROM sales_products_prices')
    expect(sale.server_id).not.toBeNull()
    expect(await db.query('SELECT * FROM operations')).toHaveLength(0)
  })

  it('цены продажи с другого устройства приезжают один раз', async () => {
    const { orderId, productId } = await seedWorkshop()

    await db.execute('DELETE FROM operations')
    await markServerId('orders', orderId, 77)
    await markServerId('products', productId, 42)

    server.seed('sales_products_prices', { order_id: 77, product_id: 42, sale_price: 990 })

    await syncService.sync()
    await syncService.sync()

    const sales = await db.query('SELECT * FROM sales_products_prices')
    expect(sales).toHaveLength(1)
    expect(Number(sales[0].sale_price)).toBe(990)
    expect(sales[0].server_id).not.toBeNull()
  })
})

