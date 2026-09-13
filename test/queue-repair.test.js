// test/queue-repair.test.js
//
// Дефект живого прогона 14.11 (Android, релиз 1.3): «не может достучаться до сервера».
//
// На самом деле сервер отвечал — приложение вообще не делало запросов. Причина:
// операция-ребёнок (`order_service/insert`) ждала `server_id` родителя, а вставка
// родителя из очереди уже ушла (сдалась / её убрали кнопкой / применилась на сервере
// без «примирения» локальной строки). `_resolveFkDependency` откладывала ребёнка каждый
// синк, `_syncLocalToServer` не находил готовых операций и выходил ДО сетевого вызова:
// `POST /sync` не формировался вовсе, очередь не убывала, индикатор показывал «не
// отправлено», а у мастера это выглядело как «сервер недоступен».
//
// Что проверяем:
//   1. откладывание не бесконечно: после `MAX_DEFERRALS` операция уходит в `blocked`
//      с причиной, и POST действительно не делается (никаких «тихих» циклов);
//   2. «Починка очереди» пересобирает потерянную вставку родителя и очередь уезжает;
//   3. если родитель на сервере есть, а локальный `server_id` потерян — запись
//      примиряется по `uuid_id` (без второго дубля) и ребёнок тоже уезжает.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import db from 'src/database/db.js'
import api from 'src/services/api'
import syncService from 'src/services/syncService.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import storage from 'src/utils/storage.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'

let server

beforeEach(async () => {
  await setupTestDb()

  storage.setItem('auth_token', 'test-token')

  server = createFakeServer()
  vi.spyOn(api, 'send').mockImplementation(payload => server.send(payload))
  vi.spyOn(api, 'fetchUpdates').mockImplementation(args => server.fetchUpdates(args))

  // syncService — singleton: сбрасываем состояние между тестами.
  syncService.syncing = false
  syncService.status = {
    online: true,
    syncing: false,
    lastError: null,
    consecutiveFailures: 0,
    nextRetryAt: 0,
    pendingCount: 0,
    failedCount: 0,
    blockedCount: 0,
    requiresAuth: false,
  }
  syncService._listeners = new Set()
  syncService._columnCache.clear()
})

afterEach(() => {
  storage.removeItem('auth_token')
  vi.restoreAllMocks()
})

/** Полная цепочка офлайн: категория → услуга → заказ → связка (задача 5.4). */
async function createOrderChain() {
  const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
  const serviceId = await servicesRepo.save({ service: 'Работа', price: 500, category_id: categoryId })
  const clientId = await clientsRepo.save({ name: 'Иван' })
  const orderId = await ordersRepo.save({ client_id: clientId, total_amount: 500 })

  await orderServiceRepo.add(orderId, serviceId)

  return { categoryId, serviceId, clientId, orderId }
}

const serverIdOf = async (table, id) =>
  (await db.queryOne(`SELECT server_id FROM ${table} WHERE id = ?`, [id])).server_id

describe('14.11 очередь не «висит» на родителе, которого нет', () => {
  it('после MAX_DEFERRALS операция становится blocked, и POST больше не делается', async () => {
    const { orderId } = await createOrderChain()

    // Воспроизводим состояние с телефона: вставки родителя из очереди ушли
    // (сдались/убраны), а записи на сервере так и не появились.
    await db.execute(`DELETE FROM operations WHERE "table" IN ('orders', 'services')`)

    await syncService.sync()
    await syncService.sync()
    await syncService.sync()

    const child = await db.queryOne(
      `SELECT * FROM operations WHERE "table" = 'order_service' AND status = 'blocked'`
    )

    expect(child).toMatchObject({ status: 'blocked' })
    expect(child.deferred_count).toBe(3)
    expect(child.last_error).toContain('orders')
    expect(await operationsRepo.countBlocked()).toBe(1)
    expect(syncService.getStatus().blockedCount).toBe(1)

    // Готовых операций нет → POST /sync не формируется вовсе (это и выглядело как
    // «приложение не видит сервер»: в логах сервера не было ни одного запроса).
    const sendsBefore = api.send.mock.calls.length
    await syncService.sync()

    expect(api.send.mock.calls.length).toBe(sendsBefore)
    expect(await serverIdOf('orders', orderId)).toBeNull()
    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('repairQueue пересобирает потерянные вставки родителей и дожимает очередь', async () => {
    const { serviceId, orderId } = await createOrderChain()

    await db.execute(`DELETE FROM operations WHERE "table" IN ('orders', 'services')`)

    // Доводим ребёнка до `blocked`, как на живом устройстве.
    await syncService.sync()
    await syncService.sync()
    await syncService.sync()

    expect(await operationsRepo.countBlocked()).toBe(1)

    const report = await syncService.repairQueue()

    // Родителей на сервере нет → вставки пересобраны из локальных строк.
    expect(report).toMatchObject({ parents: 2, reconciled: 0, requeuedParents: 2, blockedLeft: 0 })

    // Родители получили server_id (волна 1), связка уехала следом (волна 2).
    expect(await serverIdOf('orders', orderId)).not.toBeNull()
    expect(await serverIdOf('services', serviceId)).not.toBeNull()
    expect(server.list('order_service')).toHaveLength(1)
    expect(await operationsRepo.countPending()).toBe(0)
    expect(await operationsRepo.countBlocked()).toBe(0)
  })

  it('родитель есть на сервере, локальный server_id потерян — примиряем по uuid_id', async () => {
    const { serviceId, orderId } = await createOrderChain()

    // Как в жизни: курсор выдачи уже «прошёл» запись, поэтому обычный sync() её
    // не привезёт — нужна перечитка с нуля (её и делает «Починка очереди»).
    server.configure({ filterSince: true })

    // Сначала всё уезжает нормально: услуга и заказ на сервере.
    await syncService.sync()

    expect(await serverIdOf('services', serviceId)).not.toBeNull()

    // Теперь «теряем» локальную привязку услуги (как в живом случае: сервер запись
    // знает, клиент — нет) и ставим новую связку заказа с этой услугой.
    await db.execute('UPDATE services SET server_id = NULL WHERE id = ?', [serviceId])
    await orderServiceRepo.add(orderId, serviceId)

    await syncService.sync()

    const report = await syncService.repairQueue()

    expect(report).toMatchObject({ parents: 1, reconciled: 1, requeuedParents: 0 })

    // Дубля услуги не появилось: запись примирена по `uuid_id`, а не вставлена второй раз.
    expect(server.list('services')).toHaveLength(1)
    expect(await db.query(`SELECT * FROM services WHERE id = ?`, [serviceId])).toHaveLength(1)
    expect(await operationsRepo.countPending()).toBe(0)
    expect(await operationsRepo.countBlocked()).toBe(0)
  })
})
