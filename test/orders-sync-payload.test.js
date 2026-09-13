// test/orders-sync-payload.test.js
//
// Дефект живого прогона (11.6): payload синка заказа уезжал с вычисляемыми полями
// из JOIN-выборки (`client_name`/`client_phone`), которых нет в таблице `orders`
// на сервере. Сервер отвечал
// `DATABASE_ERROR: column "client_name" of relation "orders" does not exist`,
// операция возвращалась в pending и висела в очереди навсегда — правка статуса и
// оплаты не доезжала.
//
// Причина: `useOrdersStore.items` приходят из SQL с `c.name AS client_name`,
// `useOrdersStore.update` мержит их в объект, а `ordersRepo.update` собирал payload
// как `{...order}`. Теперь вычисляемые поля вырезаются (`toServerPayload`).
import { describe, it, expect, beforeEach } from 'vitest'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'

/** Заказ так, как его отдаёт `queries.getById`: с полями из JOIN по клиенту. */
async function orderRowWithClient(orderId) {
  return db.queryOne(
    `SELECT o.*, c.name AS client_name, c.phone AS client_phone
     FROM orders o LEFT JOIN clients c ON o.client_id = c.id
     WHERE o.id = ?`,
    [orderId]
  )
}

/** Последняя операция очереди по типу (payload разобран). */
async function lastOperation(type) {
  const rows = await db.query(
    `SELECT * FROM operations WHERE "table" = 'orders' AND type = ? ORDER BY created_at DESC LIMIT 1`,
    [type]
  )
  return rows.length ? { ...rows[0], payload: JSON.parse(rows[0].payload) } : null
}

describe('payload синка заказа не содержит вычисляемых полей', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('update не шлёт client_name/client_phone (это и валило UPDATE на сервере)', async () => {
    const specializationId = await specializationsRepo.save({ name: 'Мастерская' })
    const clientId = await clientsRepo.save({ name: 'Иван', phone: '+7' })
    const orderId = await ordersRepo.save({
      specialization_id: specializationId,
      client_id: clientId,
      total_amount: 1000,
    })
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [42, orderId])

    const row = await orderRowWithClient(orderId)
    expect(row.client_name).toBe('Иван')

    await ordersRepo.update({ ...row, status: 'done' })

    const op = await lastOperation('update')
    expect(op).not.toBeNull()
    expect(op.payload.id).toBe(42)
    expect(op.payload.status).toBe('done')
    expect(op.payload).not.toHaveProperty('client_name')
    expect(op.payload).not.toHaveProperty('client_phone')

    const saved = await db.queryOne('SELECT status FROM orders WHERE id = ?', [orderId])
    expect(saved.status).toBe('done')
  })

  it('insert тоже не шлёт вычисляемые поля', async () => {
    const specializationId = await specializationsRepo.save({ name: 'Мастерская' })
    const clientId = await clientsRepo.save({ name: 'Пётр', phone: '+7' })

    await ordersRepo.save({
      specialization_id: specializationId,
      client_id: clientId,
      total_amount: 500,
      client_name: 'Пётр',
      client_phone: '+7',
    })

    const op = await lastOperation('insert')
    expect(op).not.toBeNull()
    expect(op.payload.local_id).toBeTruthy()
    expect(op.payload).not.toHaveProperty('client_name')
    expect(op.payload).not.toHaveProperty('client_phone')
  })
})
