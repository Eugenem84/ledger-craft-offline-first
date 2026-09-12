// test/incoming-products.test.js
//
// Задача 9.2: приход товара. Проверяем обе половины критерия —
//   • приход сохраняется **офлайн** (локальная БД + очередь синка: раньше диалог
//     стучался в `POST /arrival_product` через `boot/axios.js` с фиктивным `baseURL`);
//   • **повтор не удваивает остаток**: остаток увеличивает сервер ровно один раз
//     (идемпотентность по `uuid_id`), а клиент остаток не отправляет вовсе —
//     только приход, закупочную цену и цену продажи.
//
// БД — настоящий sql.js в памяти (`test/helpers/testDb.js`), сеть — фейковый сервер
// `SyncController` (`test/helpers/fakeServer.js`). Заглушены только транспорт и хранилище.
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
import * as productStocksRepo from 'src/repositories/productStocksRepo.js'
import * as buyProductPricesRepo from 'src/repositories/buyProductPricesRepo.js'
import { useProductsStore } from 'src/stores/useProductsStore.js'

let server

/** Товар мастерской: специализация → категория товаров → товар. */
async function seedProduct() {
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

  return db.queryOne('SELECT * FROM products WHERE id = ?', [productId])
}

/** Что стоит в очереди синка: список таблиц в порядке постановки. */
async function queuedTables() {
  const rows = await db.query('SELECT * FROM operations ORDER BY created_at ASC')
  return rows.map(row => row.table)
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())

  // Синк требует вход (задача 7.4): без токена он вообще не ходит в сеть.
  storage.setItem('auth_token', 'test-token')

  server = createFakeServer()
  vi.spyOn(api, 'send').mockImplementation(payload => server.send(payload))
  vi.spyOn(api, 'fetchUpdates').mockImplementation(args => server.fetchUpdates(args))

  // syncService — singleton, сбрасываем его состояние между тестами.
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


describe('9.2 приход товара офлайн', () => {
  it('пишет приход, закупочную цену, остаток и цену продажи — и ставит в очередь только нужное', async () => {
    const product = await seedProduct()
    const store = useProductsStore()
    await store.loadByCategoryId(product.product_category_id)

    const result = await store.receiveArrival({
      product,
      byPrice: 300,
      arrivalQuantity: 5,
      baseSalePrice: 2000,
    })

    // Локальные последствия прихода.
    expect(result).toMatchObject({ quantity: 5, byPrice: 300, stockQuantity: 5 })
    expect(
      await db.queryOne('SELECT * FROM incoming_products WHERE id = ?', [result.arrivalId])
    ).toMatchObject({ quantity: 5, by_price: 300, supplier: '' })
    expect(await productStocksRepo.getByProductId(product.id)).toMatchObject({ quantity: 5 })
    expect(await buyProductPricesRepo.getLatestByProductId(product.id)).toMatchObject({
      buy_price: 300,
    })
    expect(
      await db.queryOne('SELECT base_sale_price FROM products WHERE id = ?', [product.id])
    ).toMatchObject({ base_sale_price: 2000 })

    // В списке склада цена продажи тоже обновилась (без перезагрузки).
    expect(store.items[0].base_sale_price).toBe(2000)

    // Очередь: приход + закупочная цена + цена продажи. Остатка здесь нет —
    // его увеличивает сервер ровно один раз (иначе был бы двойной учёт).
    const tables = await queuedTables()
    expect(tables).toContain('incoming_products')
    expect(tables).toContain('buy_product_prices')
    expect(tables).toContain('products')
    expect(tables).not.toContain('product_stocks')
  })

  it('повторный приход увеличивает остаток и создаёт второй документ, цена — одна строка', async () => {
    const product = await seedProduct()
    const store = useProductsStore()

    const first = await store.receiveArrival({ product, byPrice: 300, arrivalQuantity: 5 })
    const second = await store.receiveArrival({ product, byPrice: 500, arrivalQuantity: 3 })

    expect(first.stockQuantity).toBe(5)
    expect(second.stockQuantity).toBe(8)

    // Два прихода — два документа, а остаток один и равен сумме.
    expect(await db.query('SELECT * FROM incoming_products')).toHaveLength(2)
    expect(await productStocksRepo.getByProductId(product.id)).toMatchObject({ quantity: 8 })

    // Закупочная цена — одна актуальная строка на товар…
    const prices = await db.query('SELECT * FROM buy_product_prices')
    expect(prices).toHaveLength(1)
    expect(prices[0].buy_price).toBe(500)

    // …и незаезженный INSERT переписан: на сервер ушла бы последняя цена,
    // а не первая (payload операции сериализуется в момент постановки в очередь).
    const priceOps = (await db.query('SELECT * FROM operations')).filter(
      op => op.table === 'buy_product_prices'
    )
    expect(priceOps).toHaveLength(1)
    expect(JSON.parse(priceOps[0].payload).buy_price).toBe(500)
  })

  it('некорректное количество не создаёт ни прихода, ни остатка', async () => {
    const product = await seedProduct()

    await expect(
      useProductsStore().receiveArrival({ product, byPrice: 100, arrivalQuantity: 0 })
    ).rejects.toThrow(/количество/i)

    expect(await db.query('SELECT * FROM incoming_products')).toHaveLength(0)
    expect(await productStocksRepo.getByProductId(product.id)).toBeNull()
  })
})


describe('9.2 приход в синхронизации', () => {
  it('приход уезжает с серверным id товара, получает server_id, а остаток клиент не отправляет', async () => {
    const product = await seedProduct()
    // Товар уже уезжал в синк: очередь пуста, у строки есть серверный id.
    await db.execute('DELETE FROM operations')
    await db.execute('UPDATE products SET server_id = ? WHERE id = ?', [42, product.id])

    const result = await useProductsStore().receiveArrival({
      product,
      byPrice: 300,
      arrivalQuantity: 5,
    })

    await syncService.sync()

    // FK переведён: на сервер ушёл серверный id товара, а не локальный UUID.
    const sentArrival = server.received.find(entry => entry.table === 'incoming_products')
    expect(sentArrival.payload.product_id).toBe(42)
    expect(sentArrival.payload.quantity).toBe(5)

    // Остаток клиент не отправляет вовсе — его считает сервер (иначе двойной учёт).
    expect(server.applied.some(entry => entry.table === 'product_stocks')).toBe(false)

    // Приход получил серверный id, очередь пуста.
    const arrival = await db.queryOne('SELECT * FROM incoming_products WHERE id = ?', [
      result.arrivalId,
    ])
    expect(arrival.server_id).not.toBeNull()
    expect(await db.query('SELECT * FROM operations')).toHaveLength(0)
  })

  it('остаток и чужие приходы приезжают с сервера и не плодят дублей', async () => {
    const product = await seedProduct()
    // Товар уже уезжал в синк: очередь пуста, у строки есть серверный id.
    await db.execute('DELETE FROM operations')
    await db.execute('UPDATE products SET server_id = ? WHERE id = ?', [42, product.id])

    const result = await useProductsStore().receiveArrival({
      product,
      byPrice: 300,
      arrivalQuantity: 5,
    })

    // Сервер — источник истины по остатку: у него уже 12 (наш приход + закупка из web-версии).
    server.seed('product_stocks', { product_id: 42, quantity: 12 })
    // И приход, сделанный другим устройством.
    server.seed('incoming_products', { product_id: 42, quantity: 4, by_price: 100, supplier: '' })

    await syncService.sync()

    // Остаток — одна строка на товар: наша «предсказанная» строка приняла значения сервера.
    const stocks = await db.query('SELECT * FROM product_stocks')
    expect(stocks).toHaveLength(1)
    expect(stocks[0].server_id).not.toBeNull()
    expect(stocks[0].quantity).toBe(12)

    // Приходов стало два: наш (уже с server_id) и чужой (пришёл выгрузкой).
    const arrivals = await db.query('SELECT * FROM incoming_products ORDER BY created_at ASC')
    expect(arrivals).toHaveLength(2)
    expect(arrivals.some(row => row.id === result.arrivalId && row.server_id !== null)).toBe(true)
    expect(arrivals.some(row => row.quantity === 4 && row.by_price === 100)).toBe(true)
  })
})
