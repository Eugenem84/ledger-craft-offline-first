// test/order-margin.test.js
//
// Разбор жалобы владельца 15.09.2026: «в статистике по марже прочерки и нули, хотя
// товар заведён». Причина — не формула (она та же, что на сервере), а запись данных:
// при правке заказа `useOrderDraftStore.updateOrder()` пересоздаёт строки позиций
// («удалить и добавить заново») и **не передавал `buy_price`** — себестоимость
// стиралась при каждом сохранении правки. «Аналитика» после этого показывала
// «закупка 0», маржу, равную выручке, и наценку прочерком.
//
// Тест гоняет весь реальный путь на настоящем sql.js: склад (поступление с ценой
// закупки) → заказ с товаром со склада и ручной позицией → закрытие и оплата →
// цифры «Аналитики» → повторное открытие заказа, правка и сохранение → цифры
// обязаны остаться теми же.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as analyticsRepo from 'src/repositories/analyticsRepo.js'

import { useProductsStore } from 'src/stores/useProductsStore.js'
import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'
import { useOrdersStore } from 'src/stores/useOrdersStore.js'
import { orderMargin, summarize } from 'src/utils/analytics.js'

/** Мастерская с товаром на складе и справочником для формы заказа. */
async function seedWorkshop() {
  const specializationId = await specializationsRepo.save({ name: 'Ремонт' })
  const categoryId = await categoriesRepo.save({
    category_name: 'Двигатель',
    specialization_id: specializationId,
  })
  await servicesRepo.save({ service: 'Замена масла', price: 500, category_id: categoryId })
  await clientsRepo.save({ name: 'Иван', phone: '123', specialization_id: specializationId })

  const productCategoryId = await productCategoriesRepo.save({
    name: 'Фильтры',
    specialization_id: specializationId,
  })
  const productId = await productsRepo.save({
    name: 'Фильтр',
    base_sale_price: 1000,
    product_category_id: productCategoryId,
  })

  return { specializationId, productId, productCategoryId }
}

/** Отмечает заказ «закрыт и оплачен» — так его берёт в расчёт «Аналитика». */
async function closeAndPay(orderId) {
  await db.execute('UPDATE orders SET status = ?, paid = ?, updated_at = ? WHERE id = ?', [
    'done',
    1,
    Math.floor(Date.now() / 1000),
    orderId,
  ])
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

describe('маржа: закупка позиций переживает правку заказа (разбор 15.09.2026)', () => {
  it('товар со склада и ручная позиция: маржа «Аналитики» не обнуляется после пересохранения', async () => {
    const { specializationId, productId, productCategoryId } = await seedWorkshop()

    // Склад: поступление 3 шт по 700 р, продажа — 1000 р (задача 9.2).
    const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [productId])
    await useProductsStore().receiveArrival({
      product,
      byPrice: 700,
      arrivalQuantity: 3,
      baseSalePrice: 1000,
    })

    const [stored] = await productsRepo.getByCategoryId(productCategoryId)
    expect(stored.buy_price).toBe(700) // склад отдаёт закупку в списке товаров

    // Заказ: 2 товара со склада + ручная позиция с закупкой.
    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.selectedStoreProduct = stored
    draft.addProductFromStore({ amount: 2 })
    draft.addMaterial({ name: 'Герметик', price: 100, amount: 1, buy_price: 20 })

    expect(draft.productsCost).toBe(1400) // 2 × 700
    expect(draft.materialsCost).toBe(20)
    expect(draft.margin).toBe(680) // (2000 + 100) − 1420

    const orderId = await draft.createOrder()
    await closeAndPay(orderId)

    // Цифры «Аналитики» до правки.
    const before = summarize(await analyticsRepo.getOrders(specializationId), 'month')

    expect(before).toEqual({
      revenue: 2100, // 2 × 1000 + 100
      cost: 1420, // 2 × 700 + 20
      margin: 680,
      marginPercent: 48, // 680 / 1420 ≈ 47.9 %
      ordersCount: 1,
      averageCheck: 2100,
    })

    // Повторное открытие заказа (из списка ордеров, как в приложении) и сохранение
    // правки — тот самый путь `updateOrder`, который раньше стирал себестоимость.
    const ordersStore = useOrdersStore()
    await ordersStore.load()
    await ordersStore.select(orderId)

    const reopened = useOrderDraftStore()
    await reopened.loadOrder(ordersStore.getSelectedOrder)

    expect(reopened.products[0].buy_price).toBe(700)
    expect(reopened.materials[0].buy_price).toBe(20)

    reopened.editMode = true
    await reopened.save()

    // Строки пересозданы — но закупка на месте.
    const productLine = await db.queryOne('SELECT * FROM order_product WHERE order_id = ?', [orderId])
    const materialLine = await db.queryOne('SELECT * FROM materials WHERE order_id = ?', [orderId])

    expect(productLine.buy_price).toBe(700)
    expect(materialLine.buy_price).toBe(20)

    // И цифры «Аналитики» те же: маржа сходится с суммой позиций.
    const orders = await analyticsRepo.getOrders(specializationId)
    const after = summarize(orders, 'month')

    expect(after).toEqual(before)
    expect(orderMargin(orders[0])).toBe(680)

    // Топы тоже считают маржу по строкам (задача 9.5/9.6), а не по нулевой закупке.
    const { from, to } = { from: 0, to: Math.floor(Date.now() / 1000) }
    const [topProduct] = await analyticsRepo.getTopProducts(specializationId, from, to)

    expect(Number(topProduct.margin)).toBe(600) // 2 × (1000 − 700)
  })
})
