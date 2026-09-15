// test/stock-history.test.js
//
// Правка владельца 15.09.2026: «в разделе склад нужна история приходов и расходов
// товаров», «две вкладки: товары и … история движения по складу … и редактирование».
// Проверяем:
//
//   • сборку ленты (`toMovements`) — приходы со знаком «+», расходы «−», новые сверху,
//     у прихода есть id для правки и признак «уже на сервере»;
//   • чтение из **настоящего** sql.js: приходы (рубрика «Поступление») и расходы
//     (товар ушёл в заказ) складываются в один список, а удалённая строка заказа из
//     истории исчезает;
//   • историю профиля (вкладка «движение товаров») — с названиями товаров, только по
//     своим категориям и с лимитом ленты;
//   • правку прихода: пока приход в очереди — правим всё (остаток меняется на дельту,
//     ожидающий INSERT переписывается), а у прихода «на сервере» количество менять
//     нельзя (сервер остаток по нему не пересчитывает) — закупка и поставщик едут update.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'
import * as productStocksRepo from 'src/repositories/productStocksRepo.js'
import * as buyProductPricesRepo from 'src/repositories/buyProductPricesRepo.js'
import * as incomingProductsRepo from 'src/repositories/incomingProductsRepo.js'
import * as stockHistoryRepo from 'src/repositories/stockHistoryRepo.js'
import { useProductsStore } from 'src/stores/useProductsStore.js'
import { useStockHistoryStore } from 'src/stores/useStockHistoryStore.js'

const secondsNow = () => Math.floor(Date.now() / 1000)

/** Товар мастерской: специализация → категория товаров → товар. */
async function seedProduct({ name = 'Фильтр', specializationName = 'Склад' } = {}) {
  const specializationId = await specializationsRepo.save({ name: specializationName })
  const productCategoryId = await productCategoriesRepo.save({
    name: `Категория ${name}`,
    specialization_id: specializationId,
  })
  const productId = await productsRepo.save({
    name,
    base_sale_price: 1000,
    product_category_id: productCategoryId,
  })

  return db.queryOne('SELECT * FROM products WHERE id = ?', [productId])
}

/** Заказ, в который «ушёл» товар: расход складa. */
async function insertOrder({ id, specializationId = null, userOrderNumber = null }) {
  const at = secondsNow()

  await db.execute(
    `INSERT INTO orders
       (id, specialization_id, user_order_number, status, paid, created_at, updated_at)
     VALUES (?, ?, ?, 'done', 1, ?, ?)`,
    [id, specializationId, userOrderNumber, at, at]
  )
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

/** Операции очереди по таблице (правка прихода тоже ставит операции). */
async function queuedOperations(table) {
  const rows = await db.query('SELECT * FROM operations ORDER BY created_at ASC')

  return rows.filter(row => row.table === table)
}

describe('история склада: приходы и расходы товара', () => {
  it('toMovements: приход «+», расход «−», новые движения сверху', () => {
    const movements = stockHistoryRepo.toMovements({
      arrivals: [
        {
          id: 'a1',
          quantity: 2,
          by_price: 100,
          supplier: 'Поставщик',
          created_at: 100,
          server_id: null,
          product_id: 'p1',
          product_name: 'Фильтр',
        },
      ],
      expenses: [
        { id: 'e1', quantity: 1, sale_price: 300, user_order_number: 7, created_at: 200 },
      ],
    })

    expect(movements.map(movement => movement.id)).toEqual(['out-e1', 'in-a1'])
    expect(movements[0]).toMatchObject({ kind: 'out', quantity: 1, price: 300, title: 'ордер №7' })
    expect(movements[1]).toMatchObject({
      kind: 'in',
      quantity: 2,
      price: 100,
      title: 'приход · Поставщик',
      // Правка прихода в UI: id строки, товар и признак «ещё не на сервере».
      arrivalId: 'a1',
      productId: 'p1',
      productName: 'Фильтр',
      supplier: 'Поставщик',
      synced: false,
    })
  })

  it('расход править нечем, а приход с сервера помечен «количество менять нельзя»', () => {
    const [expense] = stockHistoryRepo.toMovements({
      expenses: [{ id: 'e1', quantity: 1, sale_price: 300, user_order_number: null, created_at: 1 }],
    })
    const [syncedArrival] = stockHistoryRepo.toMovements({
      arrivals: [{ id: 'a1', quantity: 1, by_price: 0, created_at: 1, server_id: 91 }],
    })

    expect(expense.title).toBe('продажа по ордеру')
    // Расход — это строка заказа, прихода для правки у неё нет.
    expect(expense.arrivalId).toBeNull()
    expect(syncedArrival.synced).toBe(true)
  })

  it('читает приходы и расходы товара из локальной БД', async () => {
    const product = await seedProduct()
    const stored = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])

    // Два прихода («Поступление» на складе, задача 9.2).
    await useProductsStore().receiveArrival({
      product: stored,
      byPrice: 700,
      arrivalQuantity: 3,
    })
    await useProductsStore().receiveArrival({
      product: stored,
      byPrice: 750,
      arrivalQuantity: 1,
    })

    // Расход: товар ушёл в заказ №12 — 2 шт по 1000.
    await insertOrder({ id: 'order-1', specializationId: product.specialization_id, userOrderNumber: 12 })
    await orderProductRepo.add('order-1', product.id, 2, 1000, 700)

    const movements = await stockHistoryRepo.getByProductId(product.id)

    expect(movements).toHaveLength(3)
    expect(movements.filter(movement => movement.kind === 'in')).toHaveLength(2)
    expect(movements.filter(movement => movement.kind === 'out')).toHaveLength(1)
    expect(movements.find(movement => movement.kind === 'out')).toMatchObject({
      quantity: 2,
      price: 1000,
      title: 'ордер №12',
      productName: 'Фильтр',
    })
    expect(movements.find(movement => movement.kind === 'in')).toMatchObject({
      title: 'приход на склад',
      productName: 'Фильтр',
    })
  })

  it('история профиля (вкладка «движение товаров»): все товары, только свои, с лимитом', async () => {
    const product = await seedProduct({ name: 'Фильтр' })
    const foreign = await seedProduct({ name: 'Свеча', specializationName: 'Другая мастерская' })

    const filter = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])
    const candle = await db.queryOne('SELECT * FROM products WHERE id = ?', [foreign.id])

    await useProductsStore().receiveArrival({ product: filter, byPrice: 700, arrivalQuantity: 3 })
    await useProductsStore().receiveArrival({ product: filter, byPrice: 700, arrivalQuantity: 1 })
    await useProductsStore().receiveArrival({ product: candle, byPrice: 100, arrivalQuantity: 9 })

    await insertOrder({
      id: 'order-1',
      specializationId: product.specialization_id,
      userOrderNumber: 5,
    })
    await orderProductRepo.add('order-1', product.id, 2, 1000, 700)

    const category = await db.queryOne('SELECT * FROM product_categories WHERE id = ?', [
      product.product_category_id,
    ])
    const movements = await stockHistoryRepo.getAll(category.specialization_id)

    // Товар из чужого профиля в историю склада не попадает.
    expect(movements).toHaveLength(3)
    expect(movements.every(movement => movement.productName === 'Фильтр')).toBe(true)
    // Порядок при равных секундах не определён (два источника, точность — секунда),
    // поэтому проверяем состав, а «свежие сверху» — отдельным тестом на `toMovements`.
    expect(movements.map(movement => movement.kind).sort()).toEqual(['in', 'in', 'out'])

    // Лимит обрезает ленту (вкладка показывает свежие движения).
    expect(await stockHistoryRepo.getAll(category.specialization_id, 2)).toHaveLength(2)

    // Без профиля история пустая, без ошибки.
    expect(await stockHistoryRepo.getAll(null)).toEqual([])

    // Стор в режиме «всё по профилю» отдаёт ту же ленту и не считает себя обрезанным.
    const history = useStockHistoryStore()
    await history.loadAll(category.specialization_id)

    expect(history.specializationId).toBe(category.specialization_id)
    expect(history.productId).toBeNull()
    expect(history.movements).toHaveLength(3)
    expect(history.truncated).toBe(false)

    await history.loadAll(null)
    expect(history.movements).toEqual([])
  })

  // ⚠️ Регрессия Android-only (15.09.2026): на телефоне категории товаров приехали синком,
  // и `applyServerRecord` положил в `product_categories.specialization_id` **серверный id**
  // («Сохраняем серверный ID как есть»), а фильтр истории искал только локальный UUID —
  // вкладка «движение товаров» была пустой, хотя в браузере (категории созданы локально)
  // лента показывалась. Фильтр обязан проверять обе формы ключа профиля.
  it('категория пришла синком (в specialization_id серверный id) — лента не пустеет', async () => {
    const product = await seedProduct({ name: 'Фильтр' })
    const stored = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])
    const category = await db.queryOne('SELECT * FROM product_categories WHERE id = ?', [
      product.product_category_id,
    ])

    // Профиль уехал в синк, а категория товара пришла из выгрузки — как на Android.
    await specializationsRepo.updateServerId(category.specialization_id, 42)
    await db.execute('UPDATE product_categories SET specialization_id = ? WHERE id = ?', [
      42,
      category.id,
    ])

    await useProductsStore().receiveArrival({ product: stored, byPrice: 700, arrivalQuantity: 3 })
    await insertOrder({
      id: 'order-1',
      specializationId: category.specialization_id,
      userOrderNumber: 7,
    })
    await orderProductRepo.add('order-1', product.id, 1, 1000, 700)

    // UI передаёт локальный UUID профиля (серверный id он не знает) — фильтр должен найти обе формы.
    const movements = await stockHistoryRepo.getAll(category.specialization_id)

    expect(movements.map(movement => movement.kind).sort()).toEqual(['in', 'out'])
    expect(movements.every(movement => movement.productName === 'Фильтр')).toBe(true)

    const history = useStockHistoryStore()
    await history.loadAll(category.specialization_id)

    expect(history.hasMovements).toBe(true)
    expect(history.dbTotals).toBeNull()
  })

  it('смешанные формы ключа профиля: видны оба вида категорий, чужие — нет', async () => {
    const product = await seedProduct({ name: 'Фильтр' })
    const foreign = await seedProduct({ name: 'Свеча', specializationName: 'Другая мастерская' })

    const first = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])
    const candle = await db.queryOne('SELECT * FROM products WHERE id = ?', [foreign.id])
    const category = await db.queryOne('SELECT * FROM product_categories WHERE id = ?', [
      product.product_category_id,
    ])
    const specializationId = category.specialization_id

    // Профиль синхронизирован: у одной категории серверный id, у второй — локальный UUID
    // (в одной базе встречаются обе формы: `updateFromServer` перезаписывает колонку).
    await specializationsRepo.updateServerId(specializationId, 42)
    await db.execute('UPDATE product_categories SET specialization_id = ? WHERE id = ?', [
      42,
      category.id,
    ])

    const localCategoryId = await productCategoriesRepo.save({
      name: 'Своя категория',
      specialization_id: specializationId,
    })
    const ownProductId = await productsRepo.save({
      name: 'Вторая',
      base_sale_price: 500,
      product_category_id: localCategoryId,
    })
    const ownProduct = await db.queryOne('SELECT * FROM products WHERE id = ?', [ownProductId])

    await useProductsStore().receiveArrival({ product: first, byPrice: 700, arrivalQuantity: 3 })
    await useProductsStore().receiveArrival({ product: ownProduct, byPrice: 100, arrivalQuantity: 2 })
    // Чужой профиль: в свой список он попасть не должен.
    await useProductsStore().receiveArrival({ product: candle, byPrice: 50, arrivalQuantity: 9 })

    const movements = await stockHistoryRepo.getAll(specializationId)

    expect(movements).toHaveLength(2)
    expect(movements.map(movement => movement.productName).sort()).toEqual(['Вторая', 'Фильтр'])
  })

  it('диагностика пустой ленты: `countAll` считает движения без фильтра профиля', async () => {
    const product = await seedProduct({ name: 'Фильтр' })
    const stored = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])

    await useProductsStore().receiveArrival({ product: stored, byPrice: 700, arrivalQuantity: 3 })
    await useProductsStore().receiveArrival({ product: stored, byPrice: 700, arrivalQuantity: 1 })
    await insertOrder({ id: 'order-1', userOrderNumber: 12 })
    await orderProductRepo.add('order-1', product.id, 2, 1000, 700)

    expect(await stockHistoryRepo.countAll()).toEqual({ arrivals: 2, expenses: 1 })

    // Пустой профиль: лента пуста, но счётчики показывают, что движения в базе есть —
    // именно так выглядел дефект, из-за которого вкладка молчала на Android.
    const emptySpecializationId = await specializationsRepo.save({ name: 'Пустой профиль' })
    const history = useStockHistoryStore()
    await history.loadAll(emptySpecializationId)

    expect(history.movements).toEqual([])
    expect(history.dbTotals).toEqual({ arrivals: 2, expenses: 1 })
    expect(history.error).toBeNull()
  })

  it('стор отдаёт ленту движений и итоги «пришло / ушло»', async () => {
    const product = await seedProduct()
    const stored = await db.queryOne('SELECT * FROM products WHERE id = ?', [product.id])

    await useProductsStore().receiveArrival({
      product: stored,
      byPrice: 700,
      arrivalQuantity: 3,
    })
    await useProductsStore().receiveArrival({
      product: stored,
      byPrice: 700,
      arrivalQuantity: 1,
    })

    await insertOrder({ id: 'order-1', userOrderNumber: 12 })
    const lineId = await orderProductRepo.add('order-1', product.id, 2, 1000, 700)

    const history = useStockHistoryStore()
    await history.load(product.id)

    expect(history.productId).toBe(product.id)
    expect(history.hasMovements).toBe(true)
    expect(history.totalIn).toBe(4)
    expect(history.totalOut).toBe(2)
    expect(history.error).toBeNull()

    // Возврат строки заказа: расход из истории уходит (строка мягко/жёстко удалена).
    await orderProductRepo.remove({ id: lineId })
    await history.load(product.id)

    expect(history.movements).toHaveLength(2)
    expect(history.totalOut).toBe(0)

    // Без товара стор просто очищается — без ошибки.
    await history.load(null)
    expect(history.movements).toEqual([])
    expect(history.productId).toBeNull()
  })
})

describe('правка прихода (правка владельца 15.09.2026)', () => {
  it('приход ещё в очереди: правим количество, остаток считается на дельту, INSERT переписан', async () => {
    const product = await seedProduct()
    const store = useProductsStore()
    await store.loadByCategoryId(product.product_category_id)

    const arrival = await store.receiveArrival({ product, byPrice: 700, arrivalQuantity: 5 })

    expect(
      (await db.queryOne('SELECT * FROM incoming_products WHERE id = ?', [arrival.arrivalId])).server_id
    ).toBeNull()
    expect((await productStocksRepo.getByProductId(product.id)).quantity).toBe(5)

    const result = await store.updateArrival(arrival.arrivalId, {
      quantity: 2,
      byPrice: 750,
      supplier: 'Склад №1',
    })

    expect(result).toMatchObject({ quantity: 2, byPrice: 750, supplier: 'Склад №1', stockQuantity: 2 })

    // Строка прихода и остаток: 5 − 3 = 2.
    expect(
      await db.queryOne('SELECT * FROM incoming_products WHERE id = ?', [arrival.arrivalId])
    ).toMatchObject({ quantity: 2, by_price: 750, supplier: 'Склад №1' })
    expect((await productStocksRepo.getByProductId(product.id)).quantity).toBe(2)
    // Список склада в сторе обновлён сразу (офлайн-первый подход).
    expect(store.items[0].quantity).toBe(2)

    // На сервер уйдёт новое количество: ожидающий INSERT переписан, дубля нет.
    const inserts = await queuedOperations('incoming_products')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].type).toBe('insert')
    expect(JSON.parse(inserts[0].payload)).toMatchObject({
      local_id: arrival.arrivalId,
      quantity: 2,
      by_price: 750,
      supplier: 'Склад №1',
    })

    // Закупка обновилась и в цене товара — из неё считается маржа «Аналитики».
    expect((await buyProductPricesRepo.getLatestByProductId(product.id)).buy_price).toBe(750)
  })

  it('приход на сервере: количество менять нельзя, закупка и поставщик уезжают update-операцией', async () => {
    const product = await seedProduct()
    const store = useProductsStore()
    await store.loadByCategoryId(product.product_category_id)

    const arrival = await store.receiveArrival({ product, byPrice: 700, arrivalQuantity: 5 })

    // Приход уехал: очередь пуста, у строки есть серверный id.
    await db.execute('DELETE FROM operations')
    await db.execute('UPDATE incoming_products SET server_id = ? WHERE id = ?', [91, arrival.arrivalId])

    await expect(
      incomingProductsRepo.updateArrival(arrival.arrivalId, { quantity: 3, byPrice: 700, supplier: '' })
    ).rejects.toThrow(/количество/i)

    // Ни приход, ни остаток не тронуты.
    expect(
      (await db.queryOne('SELECT * FROM incoming_products WHERE id = ?', [arrival.arrivalId])).quantity
    ).toBe(5)
    expect((await productStocksRepo.getByProductId(product.id)).quantity).toBe(5)

    // Закупка и поставщик — можно: остаток они не меняют.
    const result = await incomingProductsRepo.updateArrival(arrival.arrivalId, {
      quantity: 5,
      byPrice: 800,
      supplier: 'Другой поставщик',
    })

    expect(result).toMatchObject({ synced: true, byPrice: 800, supplier: 'Другой поставщик' })
    expect(result.stockQuantity).toBeNull()

    const updates = await queuedOperations('incoming_products')
    expect(updates).toHaveLength(1)
    expect(updates[0].type).toBe('update')
    expect(JSON.parse(updates[0].payload)).toMatchObject({
      id: 91,
      quantity: 5,
      by_price: 800,
      supplier: 'Другой поставщик',
    })
  })

  it('правка несуществующего прихода — понятная ошибка, а не падение', async () => {
    await expect(
      incomingProductsRepo.updateArrival('нет-такого-прихода', { quantity: 1 })
    ).rejects.toThrow(/не найден/i)
  })
})
