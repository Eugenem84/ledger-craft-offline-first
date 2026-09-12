// test/analytics-repo.test.js
//
// Задача 9.1: аналитика на **настоящем** sql.js с реальными миграциями и запросами
// (`analyticsRepo` + `useAnalyticsStore`). Проверяем две вещи:
//
//   1) цифры считаются по позициям и только по «учтённым» заказам (закрыт + оплачен,
//      не удалён) — набор данных и контрольная цифра (1700 / 2 / 850) те же, что в
//      серверном `LedgerCraftDocker03/tests/Feature/StatisticRepositoryTest.php`;
//   2) стор страницы отдаёт готовые блоки и пересчитывает топы при смене масштаба.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'

import * as analyticsRepo from 'src/repositories/analyticsRepo.js'
import { useAnalyticsStore } from 'src/stores/useAnalyticsStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { getPeriodRange, orderCost, orderMargin, statusBreakdown, summarize } from 'src/utils/analytics.js'

const secondsNow = () => Math.floor(Date.now() / 1000)

/** Мастерская: специализация, работа, клиент, товар (как в серверном тесте 9.1). */
async function seedWorkshop() {
  const specializationId = await specializationsRepo.save({ name: 'Ремонт' })
  const categoryId = await categoriesRepo.save({ category_name: 'Двигатель' })
  const serviceId = await servicesRepo.save({
    service: 'Замена масла',
    price: 500, // каталожная цена; в позиции будет 300 — методика считает по позиции
    category_id: categoryId,
  })
  const clientId = await clientsRepo.save({ name: 'Иван', phone: '123' })
  const productCategoryId = await productCategoriesRepo.save({
    name: 'Фильтры',
    specialization_id: specializationId,
  })
  const productId = await productsRepo.save({
    name: 'Фильтр',
    base_sale_price: 1200,
    product_category_id: productCategoryId,
  })

  return { specializationId, serviceId, clientId, productId }
}

async function insertOrder({
  id,
  specializationId,
  clientId,
  status = 'done',
  paid = 1,
  updatedAt = secondsNow(),
  deletedAt = null,
}) {
  await db.execute(
    `INSERT INTO orders
       (id, specialization_id, client_id, total_amount, status, paid, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [id, specializationId, clientId, status, paid, updatedAt, updatedAt, deletedAt]
  )
}

/**
 * Позиции заказа: `[количество, цена, закупка]` для работ и товаров,
 * `[имя, количество, цена, закупка]` для материалов. Закупка (`buy_price`) —
 * себестоимость на момент продажи, задачи 9.5/9.6; без неё маржа по строке не считается.
 */
async function insertLines({ orderId, serviceId, productId, services = [], products = [], materials = [] }) {
  const at = secondsNow()

  for (const [quantity, salePrice] of services) {
    await db.execute(
      `INSERT INTO order_service (id, order_id, service_id, sale_price, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), orderId, serviceId, salePrice, quantity, at, at]
    )
  }

  for (const [quantity, salePrice, buyPrice = null] of products) {
    await db.execute(
      `INSERT INTO order_product (id, order_id, product_id, sale_price, quantity, buy_price, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), orderId, productId, salePrice, quantity, buyPrice, at, at]
    )
  }

  for (const [name, amount, price, buyPrice = null] of materials) {
    await db.execute(
      `INSERT INTO materials (id, order_id, name, price, amount, buy_price, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), orderId, name, price, amount, buyPrice, at, at]
    )
  }
}

/**
 * Набор заказов серверного теста 9.1: один учтённый с позициями (1700), один
 * учтённый без позиций, незавершённый, неоплаченный и удалённый (soft-delete).
 */
async function seedOrders({ specializationId, serviceId, clientId, productId }) {
  await insertOrder({ id: 'billed', specializationId, clientId })
  await insertLines({
    orderId: 'billed',
    serviceId,
    productId,
    services: [[2, 300]],
    // Закупка (9.5/9.6): 1×700 (товар) + 2×20 (материал) = 740 — как в BE-тесте.
    products: [[1, 1000, 700]],
    materials: [['Герметик', 2, 50, 20]],
  })

  await insertOrder({ id: 'empty', specializationId, clientId })

  await insertOrder({ id: 'waiting', specializationId, clientId, status: 'waiting', paid: 0 })
  await insertLines({ orderId: 'waiting', serviceId, productId, services: [[5, 1000]] })

  await insertOrder({ id: 'unpaid', specializationId, clientId, paid: 0 })
  await insertLines({ orderId: 'unpaid', serviceId, productId, services: [[1, 777]] })

  await insertOrder({ id: 'deleted', specializationId, clientId, deletedAt: secondsNow() })
  await insertLines({ orderId: 'deleted', serviceId, productId, services: [[1, 999]] })
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

describe('9.1 analyticsRepo: цифры как на сервере', () => {
  it('учтённые заказы: выручка 1700, два заказа, средний чек 850 (как в BE-тесте)', async () => {
    const workshop = await seedWorkshop()
    await seedOrders(workshop)

    const orders = await analyticsRepo.getOrders(workshop.specializationId)

    // Удалённый заказ запрос не отдаёт, а неоплаченный/незавершённый — отдаёт,
    // но в выручку их не пускает методика `isBilledOrder`.
    expect(orders.map(order => order.id).sort()).toEqual(['billed', 'empty', 'unpaid', 'waiting'])

    expect(summarize(orders, 'month')).toEqual({
      revenue: 1700,
      cost: 740,
      margin: 960,
      marginPercent: 130,
      ordersCount: 2,
      averageCheck: 850,
    })
  })

  it('маржа считается по закупке позиций и сходится с суммой строк (9.5/9.6)', async () => {
    const workshop = await seedWorkshop()
    await seedOrders(workshop)

    const orders = await analyticsRepo.getOrders(workshop.specializationId)
    const billed = orders.find(order => order.id === 'billed')

    // Числа из SQL: 1×700 (товар) + 2×20 (материал); у работ себестоимости нет.
    expect(Number(billed.products_cost)).toBe(700)
    expect(Number(billed.materials_cost)).toBe(40)
    expect(orderCost(billed)).toBe(740)
    expect(orderMargin(billed)).toBe(960) // 1700 − 740
  })

  it('топы считаются по цене позиции и только по учтённым заказам', async () => {
    const workshop = await seedWorkshop()
    await seedOrders(workshop)

    const { from, to } = getPeriodRange('month')

    const services = await analyticsRepo.getTopServices(workshop.specializationId, from, to)
    expect(services).toHaveLength(1)
    expect(services[0].name).toBe('Замена масла')
    expect(Number(services[0].quantity)).toBe(2)
    expect(Number(services[0].total)).toBe(600) // 2 × 300, а не 2 × 500 (каталог)

    const products = await analyticsRepo.getTopProducts(workshop.specializationId, from, to)
    expect(products).toHaveLength(1)
    expect(products[0].name).toBe('Фильтр')
    expect(Number(products[0].quantity)).toBe(1)
    expect(Number(products[0].total)).toBe(1000)
    expect(Number(products[0].margin)).toBe(300) // 1 × (1000 − 700)

    const materials = await analyticsRepo.getTopMaterials(workshop.specializationId, from, to)
    expect(materials).toHaveLength(1)
    expect(materials[0].name).toBe('Герметик')
    expect(Number(materials[0].quantity)).toBe(2)
    expect(Number(materials[0].total)).toBe(100)
    expect(Number(materials[0].margin)).toBe(60) // 2 × (50 − 20)
  })

  it('распределение по статусам: 3 закрытых и 1 в ожидании (удалённый не считаем)', async () => {
    const workshop = await seedWorkshop()
    await seedOrders(workshop)

    const orders = await analyticsRepo.getOrders(workshop.specializationId)

    expect(statusBreakdown(orders)).toEqual([
      { value: 'waiting', label: 'ожидает', count: 1 },
      { value: 'done', label: 'готово', count: 3 },
    ])
  })
})

describe('9.1 useAnalyticsStore', () => {
  it('загружает активную специализацию, считает итоги и пересчитывает топы по масштабу', async () => {
    const workshop = await seedWorkshop()
    await seedOrders(workshop)
    await useSpecializationsStore().load()

    const analytics = useAnalyticsStore()
    await analytics.load()

    expect(analytics.specializationId).toBe(workshop.specializationId)
    expect(analytics.hasData).toBe(true)
    expect(analytics.error).toBeNull()

    expect(analytics.summary).toEqual({
      revenue: 1700,
      cost: 740,
      margin: 960,
      marginPercent: 130,
      ordersCount: 2,
      averageCheck: 850,
    })
    expect(analytics.totals.month).toBe(1700)
    expect(analytics.buckets).toHaveLength(12)
    expect(analytics.buckets.find(bucket => bucket.count > 0).total).toBe(1700)
    expect(analytics.topServices[0].name).toBe('Замена масла')

    // Границы другого масштаба — другие, но топы те же (заказы «сегодня»).
    await analytics.setPeriod('day')

    expect(analytics.period).toBe('day')
    expect(analytics.buckets).toHaveLength(31)
    expect(analytics.topServices).toHaveLength(1)
  })

  it('без специализации стор не падает и ничего не считает', async () => {
    const analytics = useAnalyticsStore()
    await analytics.load()

    expect(analytics.specializationId).toBeNull()
    expect(analytics.hasData).toBe(false)
    expect(analytics.hasSpecialization).toBe(false)
    expect(analytics.topServices).toEqual([])
    expect(analytics.error).toBeNull()
  })
})
