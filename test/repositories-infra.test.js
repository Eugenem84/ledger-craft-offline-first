// test/repositories-infra.test.js
//
// Задача 5.3: служебные репозитории синка.
//   • `operationsRepo` — очередь операций со статусами (задача 3.3),
//     атомарный `markSynced` (2.5) и восстановление in-flight (3.3);
//   • `metaRepo` — курсор выдачи на таблицу (3.6) и плавный апгрейд с общего ключа.
import { describe, it, expect, beforeEach } from 'vitest'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import operationsRepo from 'src/repositories/operationsRepo.js'
import * as metaRepo from 'src/repositories/metaRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'

const ISO_1 = '2026-09-12T10:00:00.000Z'
const seconds = value => Math.floor(Date.parse(value) / 1000)

async function insertOperation({ id, type = 'insert', table = 'clients', status = 'pending', payload = {} }) {
  await db.execute(
    `INSERT INTO operations (id, type, "table", payload, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, type, table, JSON.stringify(payload), status, 1, 1]
  )
}

beforeEach(async () => {
  await setupTestDb()
})

describe('5.3 operationsRepo (очередь)', () => {
  it('enqueue → pending, dequeue отдаёт только pending, countPending считает их', async () => {
    await operationsRepo.enqueue(['op-1', 'insert', 'clients', JSON.stringify({ local_id: 'a' }), 1])
    await operationsRepo.enqueue(['op-2', 'update', 'clients', JSON.stringify({ id: 5 }), 2])

    expect(await operationsRepo.countPending()).toBe(2)
    expect((await operationsRepo.dequeue()).map(op => op.id)).toEqual(['op-1', 'op-2'])

    await operationsRepo.markSending(['op-1'])

    expect(await operationsRepo.countPending()).toBe(1)
    expect((await operationsRepo.dequeue()).map(op => op.id)).toEqual(['op-2'])

    await operationsRepo.markPending(['op-1'])

    expect(await operationsRepo.countPending()).toBe(2)
  })

  it('markSynced сохраняет server_id и версию из ответа, удаляя операцию (3.8)', async () => {
    const clientId = await clientsRepo.save({ name: 'Иван' })
    await db.execute('DELETE FROM operations')
    await insertOperation({
      id: 'op-insert',
      status: 'sending',
      payload: { local_id: clientId, name: 'Иван' },
    })

    // dequeue отдаёт только pending — in-flight операция не отдаётся.
    expect(await operationsRepo.dequeue()).toHaveLength(0)

    const [inFlight] = await db.query(`SELECT * FROM operations WHERE id = 'op-insert'`)
    inFlight.payload = JSON.parse(inFlight.payload)

    await operationsRepo.markSynced(inFlight, { server_id: 10, updated_at: ISO_1 })

    expect(await db.queryOne('SELECT * FROM operations WHERE id = ?', ['op-insert'])).toBeNull()
    expect(await db.queryOne('SELECT * FROM clients WHERE id = ?', [clientId])).toMatchObject({
      server_id: 10,
      updated_at: seconds(ISO_1),
    })
  })

  it('markSynced для update находит строку по server_id и обновляет её версию', async () => {
    const clientId = await clientsRepo.save({ name: 'Иван' })
    await db.execute('UPDATE clients SET server_id = ? WHERE id = ?', [10, clientId])
    await insertOperation({ id: 'op-update', type: 'update', status: 'sending', payload: { id: 10 } })

    const [op] = await db.query(`SELECT * FROM operations WHERE id = 'op-update'`)
    op.payload = JSON.parse(op.payload)

    await operationsRepo.markSynced(op, { server_id: 10, updated_at: ISO_1 })

    expect(await db.queryOne('SELECT updated_at FROM clients WHERE id = ?', [clientId])).toEqual({
      updated_at: seconds(ISO_1),
    })
  })

  it('markSynced запоминает серверные id родителей для order_service (3.5)', async () => {
    // Родители должны существовать: БД открыта с включёнными внешними ключами
    // (`PRAGMA foreign_keys = ON`, как на устройстве — см. test/helpers/testDb.js).
    const orderId = await ordersRepo.save({ total_amount: 100 })
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const serviceId = await servicesRepo.save({ service: 'Розетка', category_id: categoryId })

    // Локальная строка связки (server_id у неё на сервере нет вовсе).
    await db.execute(
      `INSERT INTO order_service (id, order_id, service_id) VALUES ('line-1', ?, ?)`,
      [orderId, serviceId]
    )
    await insertOperation({
      id: 'op-line',
      table: 'order_service',
      status: 'sending',
      payload: { local_id: 'line-1', order_id: 100, service_id: 200 },
    })

    const [op] = await db.query(`SELECT * FROM operations WHERE id = 'op-line'`)
    op.payload = JSON.parse(op.payload)

    await operationsRepo.markSynced(op, { server_id: null, updated_at: ISO_1 })

    // Без этих id удаление работы не уехало бы на сервер (найдено тестами 5.4).
    expect(await db.queryOne('SELECT * FROM order_service WHERE id = ?', ['line-1'])).toMatchObject({
      order_server_id: 100,
      service_server_id: 200,
      updated_at: seconds(ISO_1),
    })
  })

  it('markSynced атомарен: сбой «примирения» откатывает удаление операции (2.5)', async () => {
    await insertOperation({ id: 'op-broken', status: 'sending', payload: { local_id: 'x' } })

    const [op] = await db.query(`SELECT * FROM operations WHERE id = 'op-broken'`)
    op.payload = JSON.parse(op.payload)
    op.table = 'nonexistent_table'

    await expect(
      operationsRepo.markSynced(op, { server_id: 1, updated_at: ISO_1 })
    ).rejects.toThrow()

    // DELETE откатился вместе с неудавшимся UPDATE — операция осталась в очереди
    // (в статусе synced), её вернёт в работу recoverInFlight().
    expect(await db.queryOne('SELECT status FROM operations WHERE id = ?', ['op-broken'])).toMatchObject({
      status: 'synced',
    })
  })

  it('recoverInFlight возвращает sending/synced-insert в pending, а synced update/delete снимает (3.3)', async () => {
    await insertOperation({ id: 'a-sending', status: 'sending' })
    await insertOperation({ id: 'b-synced-insert', status: 'synced' })
    await insertOperation({ id: 'c-synced-update', type: 'update', status: 'synced' })
    await insertOperation({ id: 'd-synced-delete', type: 'delete', status: 'synced' })

    expect(await operationsRepo.recoverInFlight()).toBe(4)

    expect(await db.query('SELECT id, status FROM operations ORDER BY id')).toEqual([
      { id: 'a-sending', status: 'pending' },
      { id: 'b-synced-insert', status: 'pending' },
    ])
  })

  it('removeByLocalId снимает незаезженный INSERT, removeByServerId — update/delete', async () => {
    await insertOperation({ id: 'op-local', payload: { local_id: 'local-1' } })
    await insertOperation({ id: 'op-server', type: 'update', payload: { id: 42 } })

    await operationsRepo.removeByLocalId('clients', 'local-1')
    expect(await db.queryOne('SELECT * FROM operations WHERE id = ?', ['op-local'])).toBeNull()

    await operationsRepo.removeByServerId('clients', 42)
    expect(await db.queryOne('SELECT * FROM operations WHERE id = ?', ['op-server'])).toBeNull()
  })
})

describe('5.3 metaRepo (курсор выдачи)', () => {
  it('get/setValue и курсор таблицы работают независимо', async () => {
    await metaRepo.setValue('some_key', 'some_value')
    expect(await metaRepo.getValue('some_key')).toBe('some_value')

    await metaRepo.setLastSyncedAt('clients', 111)
    await metaRepo.setLastSyncedAt('orders', 222)

    expect(await metaRepo.getLastSyncedAt('clients')).toBe(111)
    expect(await metaRepo.getLastSyncedAt('orders')).toBe(222)
    expect(await metaRepo.getLastSyncedAt('services')).toBe(0)
  })

  it('старый общий ключ читается как начальный курсор, свой — приоритетнее (3.6)', async () => {
    await metaRepo.setValue('last_synced_at', 500)

    expect(await metaRepo.getLastSyncedAt('clients')).toBe(500)

    await metaRepo.setLastSyncedAt('clients', 600)
    expect(await metaRepo.getLastSyncedAt('clients')).toBe(600)
    // Другие таблицы по-прежнему видят общий ключ.
    expect(await metaRepo.getLastSyncedAt('orders')).toBe(500)
  })

  it('resetLastSyncedAt сбрасывает одну таблицу или весь курсор', async () => {
    await metaRepo.setValue('last_synced_at', 500)
    await metaRepo.setLastSyncedAt('clients', 600)

    await metaRepo.resetLastSyncedAt('clients')
    expect(await metaRepo.getLastSyncedAt('clients')).toBe(500)

    await metaRepo.resetLastSyncedAt()
    expect(await metaRepo.getLastSyncedAt('clients')).toBe(0)
    expect(await metaRepo.getLastSyncedAt('orders')).toBe(0)
  })
})
