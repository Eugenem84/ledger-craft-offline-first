// test/order-draft-store.test.js
//
// Фаза 8 (8.1/8.2): стор черновика заказа — то, что раньше жило прямо в
// `OrderDetailsPage.vue`. Тест гоняет стор на **настоящем** sql.js с реальными миграциями,
// репозиториями и `ordersStore`: создание заказа с работой/материалом/товаром,
// перечитывание его позиций из БД и правка («удалить и добавить заново»).
//
// Здесь же — регрессия на «добавить модель техники из заказа»: до рефакторинга страница
// ждала локальный id от `modelsStore.add` (экшен его не возвращал) и падала на
// `modelsRepo.getById(undefined)`.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'
import * as materialsRepo from 'src/repositories/materialsRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'

import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'
import { useOrdersStore } from 'src/stores/useOrdersStore.js'

const ORDER_TABLES = ['orders', 'order_service', 'materials', 'order_product']

/** Минимальный справочник: специализация, категория работ, работа, клиент, товар. */
async function seedCatalog() {
  const specializationId = await specializationsRepo.save({ name: 'Ремонт' })
  const categoryId = await categoriesRepo.save({ category_name: 'Двигатель' })
  const serviceId = await servicesRepo.save({
    service: 'Замена масла',
    price: 500,
    category_id: categoryId,
  })
  const clientId = await clientsRepo.save({ name: 'Иван', phone: '123' })
  const productCategoryId = await productCategoriesRepo.save({
    name: 'Фильтры',
    specialization_id: specializationId,
  })
  const productId = await productsRepo.save({
    name: 'Фильтр',
    base_sale_price: 300,
    product_category_id: productCategoryId,
  })

  return { specializationId, categoryId, serviceId, clientId, productId }
}

/** Таблицы очереди операций — по ним проверяем, что позиции реально уезжают в синк. */
async function queuedTables() {
  const rows = await db.query('SELECT * FROM operations')
  return rows.map(row => row.table)
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

describe('8.1 useOrderDraftStore', () => {
  it('новый заказ: справочники, итоги и запись заказа с позициями', async () => {
    const { categoryId, serviceId, clientId, productId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })

    expect(draft.isNewOrder).toBe(true)
    expect(draft.editMode).toBe(true)
    // Справочники и первая категория работ (как делала страница в onMounted)
    expect(draft.categories).toHaveLength(1)
    expect(draft.selectedServiceCategory).toBe(categoryId)
    expect(draft.servicesByCategory.map(service => service.service)).toEqual(['Замена масла'])
    expect(draft.clients.map(client => client.name)).toEqual(['Иван'])

    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })
    draft.addMaterial({ name: 'Герметик', price: 200, amount: 2 })
    draft.selectedStoreProduct = { id: productId, name: 'Фильтр', base_sale_price: 300 }
    draft.addProductFromStore()
    draft.comments = 'тест'

    expect(draft.servicesTotal).toBe(500)
    expect(draft.materialsTotal).toBe(400)
    expect(draft.productsTotal).toBe(300)
    expect(draft.totalAmount).toBe(1200)

    const orderId = await draft.createOrder()

    expect(await db.queryOne('SELECT * FROM orders WHERE id = ?', [orderId])).toMatchObject({
      client_id: clientId,
      total_amount: 1200,
      comments: 'тест',
      status: 'waiting',
      paid: 0,
    })
    expect(await orderServiceRepo.getByOrderId(orderId)).toHaveLength(1)
    expect(await materialsRepo.getByOrderId(orderId)).toHaveLength(1)
    expect(await orderProductRepo.getByOrderId(orderId)).toHaveLength(1)

    const queued = await queuedTables()
    for (const table of ORDER_TABLES) {
      expect(queued).toContain(table)
    }
  })

  it('существующий заказ: подтягивает клиента и все позиции', async () => {
    const { serviceId, clientId, productId } = await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })
    draft.addMaterial({ name: 'Герметик', price: 200, amount: 2 })
    draft.selectedStoreProduct = { id: productId, name: 'Фильтр', base_sale_price: 300 }
    draft.addProductFromStore()
    draft.comments = 'первая правка'
    const orderId = await draft.createOrder()

    // Как со страницы списка: ордер выбран в `ordersStore`
    const ordersStore = useOrdersStore()
    await ordersStore.load()
    await ordersStore.select(orderId)

    await draft.init({ create: false })

    expect(draft.isNewOrder).toBe(false)
    expect(draft.order.id).toBe(orderId)
    expect(draft.client).toMatchObject({ id: clientId, name: 'Иван' })
    expect(draft.services).toHaveLength(1)
    expect(draft.materials).toHaveLength(1)
    expect(draft.products).toHaveLength(1)
    expect(draft.comments).toBe('первая правка')
    expect(draft.servicesTotal).toBe(500)
    expect(draft.materialsTotal).toBe(400)
    expect(draft.productsTotal).toBe(300)
  })

  it('правка заказа перезаписывает позиции без дублей и сохраняет итоги', async () => {
    const { categoryId, serviceId, clientId } = await seedCatalog()
    const secondServiceId = await servicesRepo.save({
      service: 'Замена фильтра',
      price: 100,
      category_id: categoryId,
    })

    const draft = useOrderDraftStore()
    await draft.init({ create: true })
    draft.client = { id: clientId, name: 'Иван', phone: '123' }
    draft.addService({ id: serviceId, service: 'Замена масла', price: 500 })
    draft.addMaterial({ name: 'Герметик', price: 200, amount: 1 })
    const orderId = await draft.createOrder()

    // Заказ уже синхронизирован (как после первого `sync()`) — тогда правки уходят
    // отдельными `update`-операциями, а не растворяются в `insert` (см. ordersRepo.update).
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [555, orderId])

    const ordersStore = useOrdersStore()
    await ordersStore.load()
    await ordersStore.select(orderId)
    await draft.init({ create: false })
    draft.addService({ id: secondServiceId, service: 'Замена фильтра', price: 100 })
    draft.removeMaterial(0)
    draft.comments = 'вторая правка'
    await draft.setStatus('done')
    await draft.togglePaid()
    await draft.save()

    // Меняем состав: добавляем работу, убираем материал, закрываем заказ, помечаем оплату
    expect(await db.queryOne('SELECT * FROM orders WHERE id = ?', [orderId])).toMatchObject({
      total_amount: 600,
      comments: 'вторая правка',
      status: 'done',
      paid: 1,
    })
    expect(await orderServiceRepo.getByOrderId(orderId)).toHaveLength(2)
    expect(await materialsRepo.getByOrderId(orderId)).toHaveLength(0)

    // Заказ обновляется операцией `update`, а не повторным `insert`
    const orderOps = (await db.query('SELECT * FROM operations')).filter(
      op => op.table === 'orders'
    )
    const orderTypes = orderOps.map(op => op.type)
    expect(orderTypes[0]).toBe('insert')
    expect(orderTypes.filter(type => type === 'update').length).toBeGreaterThan(0)
  })

  it('«добавить модель из заказа» создаёт модель и выбирает её (регрессия 8.1)', async () => {
    await seedCatalog()

    const draft = useOrderDraftStore()
    await draft.init({ create: true })

    const created = await draft.addModel({ name: 'Kia Rio' })

    expect(created).toMatchObject({ name: 'Kia Rio' })
    expect(created.id).toBeTruthy()
    expect(draft.model).toMatchObject({ id: created.id, name: 'Kia Rio' })
    expect(draft.models.map(model => model.id)).toContain(created.id)
  })
})
