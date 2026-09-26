// test/order-numbering.test.js
//
// Правка владельца 26.09.2026: номер заказа — человеческий, сквозной **внутри
// специализации** и с 1. Раньше список заказов и шапка карточки показывали
// `server_id` (сырой id строки в БД).
//
// Проверяем: выдачу номера при создании (репозиторий и стор), независимость
// нумерации у разных профилей, неизменность номера при правке, «догон» номеров,
// приехавших с сервера, уход номера в payload синка и разовую нумерацию
// легаси-заказов миграцией 032.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'
import { useOrdersStore } from 'src/stores/useOrdersStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'

const ISO_1 = '2026-09-26T10:00:00.000Z'

async function storedOrder(id) {
  return db.queryOne('SELECT * FROM orders WHERE id = ?', [id])
}

/** Легаси-строка: заказ без номера, с заданным временем заведения. */
async function insertLegacyOrder(id, specializationId, createdAt) {
  await db.execute(
    `INSERT INTO orders (id, specialization_id, user_order_number, status, paid, created_at, updated_at)
     VALUES (?, ?, NULL, 'waiting', 0, ?, ?)`,
    [id, specializationId, createdAt, createdAt]
  )
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

describe('нумерация заказов внутри специализации (26.09.2026)', () => {
  it('первый заказ профиля — №1, дальше по возрастанию', async () => {
    const specId = await specializationsRepo.save({ name: 'Велосервис' })

    const first = await ordersRepo.save({ specialization_id: specId })
    const second = await ordersRepo.save({ specialization_id: specId })
    const third = await ordersRepo.save({ specialization_id: specId })

    expect((await storedOrder(first)).user_order_number).toBe(1)
    expect((await storedOrder(second)).user_order_number).toBe(2)
    expect((await storedOrder(third)).user_order_number).toBe(3)
  })

  it('у каждого профиля своя нумерация с 1', async () => {
    const bikes = await specializationsRepo.save({ name: 'Велосервис' })
    const phones = await specializationsRepo.save({ name: 'Ремонт телефонов' })

    await ordersRepo.save({ specialization_id: bikes })
    await ordersRepo.save({ specialization_id: bikes })
    const phoneOrder = await ordersRepo.save({ specialization_id: phones })

    expect((await storedOrder(phoneOrder)).user_order_number).toBe(1)
  })

  it('номер не меняется при правке заказа', async () => {
    const specId = await specializationsRepo.save({ name: 'Велосервис' })
    const id = await ordersRepo.save({ specialization_id: specId })

    await ordersRepo.save({ specialization_id: specId }) // второй заказ = №2
    await ordersRepo.update({ id, status: 'done' })

    expect((await storedOrder(id)).user_order_number).toBe(1)
  })

  it('следующий номер догоняет заказ, приехавший с сервера', async () => {
    const specId = await specializationsRepo.save({ name: 'Велосервис' })
    await db.execute('UPDATE specializations SET server_id = ? WHERE id = ?', [7, specId])

    // На другом устройстве уже заведён заказ №5 — он приехал синком.
    await ordersRepo.applyServerRecord({
      id: 500,
      specialization_id: 7,
      user_order_number: 5,
      total_amount: 0,
      status: 'waiting',
      paid: 0,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    const localId = await ordersRepo.save({ specialization_id: specId })

    expect((await storedOrder(localId)).user_order_number).toBe(6)
  })

  it('номер уезжает в payload синка вместе с заказом', async () => {
    const specId = await specializationsRepo.save({ name: 'Велосервис' })
    const id = await ordersRepo.save({ specialization_id: specId })

    const op = await db.queryOne(
      `SELECT * FROM operations WHERE "table" = 'orders' AND type = 'insert'`
    )

    expect(JSON.parse(op.payload)).toMatchObject({ local_id: id, user_order_number: 1 })
  })

  it('стор выдаёт номер при создании и сразу показывает его в оптимистичном элементе', async () => {
    const specId = await specializationsRepo.save({ name: 'Велосервис' })

    const specializationsStore = useSpecializationsStore()
    specializationsStore.items = [{ id: specId, server_id: null, archived: 0 }]
    specializationsStore.selectedId = specId

    const ordersStore = useOrdersStore()
    const id = await ordersStore.add({ total_amount: 100 })
    const listed = ordersStore.items.find(order => order.id === id)

    expect(listed.user_order_number).toBe(1)
    expect((await storedOrder(id)).user_order_number).toBe(1)
  })
})

describe('миграция 032: разовая нумерация уже заведённых заказов', () => {
  async function runBackfill() {
    const migration = (await import('src/database/migrations/032_backfill_order_numbers.js')).default
    await migration.up(db)
    await migration.up(db) // повторный прогон — ничего не делает
  }

  it('нумерует легаси-заказы по профилям, по возрастанию created_at', async () => {
    const specA = await specializationsRepo.save({ name: 'Профиль A' })
    const specB = await specializationsRepo.save({ name: 'Профиль B' })

    await insertLegacyOrder('a-late', specA, 300)
    await insertLegacyOrder('a-early', specA, 100)
    await insertLegacyOrder('b-only', specB, 200)

    await runBackfill()

    expect((await storedOrder('a-early')).user_order_number).toBe(1)
    expect((await storedOrder('a-late')).user_order_number).toBe(2)
    expect((await storedOrder('b-only')).user_order_number).toBe(1)
  })

  it('продолжает нумерацию после уже проставленных номеров профиля', async () => {
    const specId = await specializationsRepo.save({ name: 'Велосервис' })
    await ordersRepo.save({ specialization_id: specId }) // №1 — уже есть
    await insertLegacyOrder('legacy', specId, 50)

    await runBackfill()

    expect((await storedOrder('legacy')).user_order_number).toBe(2)
  })
})
