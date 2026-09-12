// test/sync.test.js
//
// Задача 5.4: синхронизация подтверждается тестами — порядок «родитель → ребёнок»
// (топологическая сортировка + волны), отложенные операции, повторный прогон без
// дублей, применение серверных записей с переводом FK в локальные UUID, удаления
// (tombstones) и устойчивость к сбоям сети/сервера.
//
// БД — настоящий sql.js в памяти, сеть — фейковый сервер `SyncController`
// (test/helpers/fakeServer.js). Заглушены только транспорт и хранилище.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { v4 as uuidv4 } from 'uuid'

import db from 'src/database/db.js'
import api from 'src/services/api'
import syncService from 'src/services/syncService.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'
import * as materialsRepo from 'src/repositories/materialsRepo.js'

/** Индекс первого применения таблицы на «сервере» — им проверяем порядок. */
const orderIndex = (server, table) => server.applied.findIndex(entry => entry.table === table)

let server

beforeEach(async () => {
  await setupTestDb()

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
  }
  syncService._listeners = new Set()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('5.4 порядок «родитель → ребёнок»', () => {
  it('категория уезжает раньше услуги, очередь после sync() пуста', async () => {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const serviceId = await servicesRepo.save({ service: 'Стрижка', price: 1000, category_id: categoryId })

    await syncService.sync()

    expect(server.applied.map(entry => entry.table)).toEqual(['categories', 'services'])
    expect(orderIndex(server, 'categories')).toBeLessThan(orderIndex(server, 'services'))

    const category = await db.queryOne('SELECT * FROM categories WHERE id = ?', [categoryId])
    const service = await db.queryOne('SELECT * FROM services WHERE id = ?', [serviceId])
    expect(category.server_id).not.toBeNull()
    expect(service.server_id).not.toBeNull()

    // FK переведён: на сервер уходит серверный id категории, а не локальный UUID.
    const sentService = server.received.find(entry => entry.table === 'services')
    expect(sentService.payload.category_id).toBe(category.server_id)

    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('цепочка категория → услуга → заказ → связка уезжает волнами за один sync()', async () => {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const serviceId = await servicesRepo.save({ service: 'Работа', price: 500, category_id: categoryId })
    const clientId = await clientsRepo.save({ name: 'Иван' })
    const orderId = await ordersRepo.save({ client_id: clientId, total_amount: 500 })
    await orderServiceRepo.add(orderId, serviceId)

    await syncService.sync()

    expect(orderIndex(server, 'categories')).toBeLessThan(orderIndex(server, 'services'))
    expect(orderIndex(server, 'services')).toBeLessThan(orderIndex(server, 'order_service'))
    expect(orderIndex(server, 'clients')).toBeLessThan(orderIndex(server, 'orders'))
    expect(orderIndex(server, 'orders')).toBeLessThan(orderIndex(server, 'order_service'))

    expect(await operationsRepo.countPending()).toBe(0)
    expect((await db.queryOne('SELECT * FROM orders WHERE id = ?', [orderId])).server_id).not.toBeNull()
    expect(
      (await db.queryOne('SELECT * FROM order_service WHERE order_id = ?', [orderId])).order_server_id
    ).not.toBeNull()
  })

  it('специальности уезжают с серверными именами полей (name → specializationName)', async () => {
    await specializationsRepo.save({ name: 'Ремонт' })

    await syncService.sync()

    const sent = server.received.find(entry => entry.table === 'specializations')
    expect(sent.payload).toMatchObject({ specializationName: 'Ремонт', popularCounter: 0 })
    expect(sent.payload).not.toHaveProperty('name')

    expect(await db.queryOne('SELECT * FROM specializations')).toMatchObject({ name: 'Ремонт' })
    expect((await db.queryOne('SELECT server_id FROM specializations')).server_id).not.toBeNull()
  })

  it('_sortByDependencies ставит родителя раньше ребёнка и не вешается на цикле', () => {
    const operations = [
      { id: 'child', table: 'order_service', created_at: 1 },
      { id: 'parent', table: 'orders', created_at: 2 },
    ]

    const graph = new Map([
      ['child', new Set(['parent'])],
      ['parent', new Set()],
    ])

    expect(syncService._sortByDependencies(operations, graph).map(op => op.id)).toEqual([
      'parent',
      'child',
    ])

    const cyclic = new Map([
      ['child', new Set(['parent'])],
      ['parent', new Set(['child'])],
    ])

    expect(syncService._sortByDependencies(operations, cyclic).map(op => op.id)).toHaveLength(2)
  })
})

describe('5.4 отложенные операции', () => {
  it('операция с неразрешимым FK откладывается точечно, остальной батч уезжает', async () => {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })

    // Заказ ссылается на клиента, которого в локальной БД нет: FK не разрешить.
    await ordersRepo.save({ client_id: 'missing-client', total_amount: 100 })

    await syncService.sync()

    expect(server.applied.map(entry => entry.table)).toContain('categories')
    expect(server.applied.map(entry => entry.table)).not.toContain('orders')

    expect((await db.queryOne('SELECT * FROM categories WHERE id = ?', [categoryId])).server_id).not.toBeNull()

    const deferred = await db.queryOne(`SELECT * FROM operations WHERE "table" = 'orders'`)
    expect(deferred).toMatchObject({ type: 'insert', status: 'pending' })

    // Прогресса нет — батч не крутится в цикле: одна отправка за sync().
    expect(api.send).toHaveBeenCalledTimes(1)
    expect(await operationsRepo.countPending()).toBe(1)
  })
})

describe('5.4 повторный прогон (идемпотентность)', () => {
  it('повторная отправка того же INSERT не создаёт дубль на сервере', async () => {
    const clientId = await clientsRepo.save({ name: 'Иван' })
    await syncService.sync()

    const firstServerId = (await db.queryOne('SELECT server_id FROM clients WHERE id = ?', [clientId])).server_id
    expect(firstServerId).not.toBeNull()

    // Имитируем потерянный ответ: операция с тем же local_id отправляется снова.
    await operationsRepo.enqueue([
      uuidv4(),
      'insert',
      'clients',
      JSON.stringify({ local_id: clientId, name: 'Иван' }),
      Date.now(),
    ])

    await syncService.sync()

    expect(server.list('clients')).toHaveLength(1)
    expect((await db.queryOne('SELECT server_id FROM clients WHERE id = ?', [clientId])).server_id).toBe(
      firstServerId
    )
    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('повторная связка order_service дедуплицируется по натуральному ключу (3.5)', async () => {
    const orderId = await ordersRepo.save({ total_amount: 100 })
    const serviceId = await servicesRepo.save({
      service: 'Работа',
      price: 100,
      category_id: await categoriesRepo.save({ category_name: 'Электрика' }),
    })
    await orderServiceRepo.add(orderId, serviceId)

    await syncService.sync()
    expect(server.list('order_service')).toHaveLength(1)

    await operationsRepo.enqueue([
      uuidv4(),
      'insert',
      'order_service',
      // FK в payload — локальные id (как их кладёт orderServiceRepo.add):
      // syncService сам переведёт их в серверные.
      JSON.stringify({ local_id: uuidv4(), order_id: orderId, service_id: serviceId }),
      Date.now(),
    ])

    await syncService.sync()

    expect(server.list('order_service')).toHaveLength(1)
    expect(await operationsRepo.countPending()).toBe(0)
  })
})

describe('5.4 сервер → локально', () => {
  it('applyServerRecord переводит FK серверных записей в локальные UUID', async () => {
    server.seed('product_categories', { id: 3, name: 'Подшипники', specialization_id: null })
    server.seed('products', {
      id: 20,
      name: 'Подшипник 6204',
      description: '',
      manufacturer: 'SKF',
      product_number: '6204',
      weight: 0.05,
      base_sale_price: 300,
      product_category_id: 3,
    })

    await syncService.sync()

    const category = await db.queryOne('SELECT * FROM product_categories WHERE server_id = ?', [3])
    const product = await db.queryOne('SELECT * FROM products WHERE server_id = ?', [20])

    expect(category).not.toBeNull()
    expect(product).not.toBeNull()
    // Товар ссылается на локальный UUID категории, а не на серверный id 3.
    expect(product.product_category_id).toBe(category.id)
    expect(product.product_category_id).not.toBe(3)
    expect(product.product_category_server_id).toBe(3)
  })
})

describe('5.4 удаления с сервера (tombstones)', () => {
  it('tombstone заказа убирает его и строки каскадом, снимая «висящие» операции', async () => {
    const orderId = await ordersRepo.save({ total_amount: 100 })
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [100, orderId])
    await materialsRepo.add(orderId, { name: 'Клей', price: 300, amount: 1 })

    // «Висящая» update-операция по заказу (например, с прошлого сбоя): сервер про
    // неё ничего не отвечает, поэтому она остаётся в pending до выдачи.
    await db.execute('DELETE FROM operations')
    await operationsRepo.enqueue([uuidv4(), 'update', 'orders', JSON.stringify({ id: 100 }), Date.now()])
    server.configure({ noResultFor: op => op.type === 'update' })

    // Другое устройство удалило заказ: сервер отдаёт tombstone.
    server.seed('orders', { id: 100, total_amount: 100, deleted_at: new Date().toISOString() })

    await syncService.sync()

    expect(await db.queryOne('SELECT * FROM orders WHERE id = ?', [orderId])).toBeNull()
    expect(await db.queryOne('SELECT * FROM materials WHERE order_id = ?', [orderId])).toBeNull()
    // Операция по удалённой записи снята — иначе она «воскресила» бы строку.
    expect(await db.query(`SELECT * FROM operations WHERE "table" = 'orders'`)).toHaveLength(0)
  })

  it('tombstone связки приходит по uuid_id и отменяет незаезженный INSERT (3.5/3.9)', async () => {
    const orderId = await ordersRepo.save({ total_amount: 100 })
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [100, orderId])
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const serviceId = await servicesRepo.save({ service: 'Работа', price: 100, category_id: categoryId })
    await orderServiceRepo.add(orderId, serviceId)

    const line = await db.queryOne('SELECT * FROM order_service WHERE order_id = ?', [orderId])

    // У связки нет своего PK: идентичность — клиентский uuid_id (= локальный id).
    server.seed('order_service', {
      id: null,
      uuid_id: line.id,
      order_id: 100,
      service_id: 1,
      deleted_at: new Date().toISOString(),
    })

    // Локальный INSERT сервер не принимает (ошибка) — операция остаётся в очереди,
    // а tombstone другого устройства должен её отменить и убрать строку локально.
    server.configure({ errorFor: op => (op.table === 'order_service' ? 'DATABASE_ERROR' : null) })

    await syncService.sync()

    expect(await db.queryOne('SELECT * FROM order_service WHERE id = ?', [line.id])).toBeNull()
    expect(
      await db.query(`SELECT * FROM operations WHERE "table" = 'order_service'`)
    ).toHaveLength(0)
    expect(await operationsRepo.countPending()).toBe(0)
  })
})

describe('5.4 сбои сети и сервера', () => {
  it('сетевой сбой возвращает операции в pending и ставит паузу (3.7)', async () => {
    await clientsRepo.save({ name: 'Иван' })
    server.configure({ failSendWith: new Error('network down') })

    await syncService.sync()

    expect(await operationsRepo.countPending()).toBe(1)
    expect(syncService.status.consecutiveFailures).toBe(1)
    expect(syncService.status.nextRetryAt).toBeGreaterThan(Date.now())

    // Повторный sync() в паузе на сервер не ходит.
    await syncService.sync()
    expect(api.send).toHaveBeenCalledTimes(1)

    // Ручной повтор (force) игнорирует паузу и увозит очередь.
    await syncService.sync({ force: true })

    expect(api.send).toHaveBeenCalledTimes(2)
    expect(await operationsRepo.countPending()).toBe(0)
    expect(syncService.status.consecutiveFailures).toBe(0)
  })

  it('серверная ошибка по одной операции не теряет её и не срывает остальной батч', async () => {
    await clientsRepo.save({ name: 'Хороший' })
    await clientsRepo.save({ name: 'Плохой' })
    server.configure({ errorFor: op => (op.payload.name === 'Плохой' ? 'DATABASE_ERROR' : null) })

    await syncService.sync()

    const bad = await db.queryOne(`SELECT * FROM operations WHERE "table" = 'clients'`)
    expect(bad).toMatchObject({ status: 'pending' })
    expect(JSON.parse(bad.payload).name).toBe('Плохой')

    expect((await db.queryOne(`SELECT * FROM clients WHERE name = 'Хороший'`)).server_id).not.toBeNull()
    expect(await operationsRepo.countPending()).toBe(1)
  })

  it('200 OK без ответа по операции — она возвращается в pending (3.5)', async () => {
    await clientsRepo.save({ name: 'Иван' })
    server.configure({ noResultFor: () => true })

    await syncService.sync()

    expect(await db.queryOne('SELECT server_id FROM clients')).toMatchObject({ server_id: null })
    expect(await operationsRepo.countPending()).toBe(1)
    expect(api.send).toHaveBeenCalledTimes(1)
  })

  it('офлайн: sync() не делает сетевых попыток, операции остаются в очереди', async () => {
    await clientsRepo.save({ name: 'Иван' })

    const originalIsOnline = syncService._isOnline
    syncService._isOnline = () => false

    try {
      await syncService.sync()

      expect(api.send).not.toHaveBeenCalled()
      expect(await operationsRepo.countPending()).toBe(1)
      expect(syncService.getStatus().online).toBe(false)
    } finally {
      syncService._isOnline = originalIsOnline
    }
  })
})

