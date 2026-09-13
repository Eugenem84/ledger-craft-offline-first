// test/repositories-orders.test.js
//
// Задача 5.3: репозитории заказов и связанных строк — каждая мутация пишет
// запись в БД и операцию в очередь; `applyServerRecord` переводит серверные
// id родителей в локальные UUID.
import { describe, it, expect, beforeEach } from 'vitest'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js'
import * as orderProductRepo from 'src/repositories/orderProductRepo.js'
import * as materialsRepo from 'src/repositories/materialsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as modelsRepo from 'src/repositories/modelsRepo.js'

async function queue() {
  const rows = await db.query('SELECT *, rowid AS _rowid FROM operations ORDER BY _rowid ASC')
  return rows.map(row => ({ ...row, payload: JSON.parse(row.payload) }))
}

/** Заказ с серверным id (как после первого sync) — родитель для строк. */
async function syncedOrder(serverId = 100) {
  const id = await ordersRepo.save({ total_amount: 1000 })
  await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [serverId, id])
  return id
}

const ISO_1 = '2026-09-12T10:00:00.000Z'
const seconds = value => Math.floor(Date.parse(value) / 1000)

beforeEach(async () => {
  await setupTestDb()
})

describe('5.3 clientsRepo', () => {
  it('save кладёт запись и INSERT-операцию с local_id', async () => {
    const id = await clientsRepo.save({ name: 'Иван', phone: '123' })

    expect(await clientsRepo.getById(id)).toMatchObject({ name: 'Иван', phone: '123', server_id: null })

    const insertOp = (await queue())[0]
    expect(insertOp).toMatchObject({ type: 'insert', table: 'clients' })
    expect(insertOp.payload).toMatchObject({ local_id: id, name: 'Иван', phone: '123' })
    expect(insertOp.payload).not.toHaveProperty('id')
  })

  it('update ставит операцию только после sync; remove снимает с сервера', async () => {
    const id = await clientsRepo.save({ name: 'Иван' })

    await clientsRepo.update({ id, name: 'Иван-2' })
    expect(await queue()).toHaveLength(1) // update без server_id не ставится

    await db.execute('UPDATE clients SET server_id = ? WHERE id = ?', [7, id])
    await clientsRepo.update({ id, name: 'Иван-3' })

    const updateOp = (await queue())[1]
    expect(updateOp).toMatchObject({ type: 'update', table: 'clients' })
    expect(updateOp.payload).toMatchObject({ id: 7, name: 'Иван-3' })

    await clientsRepo.remove(id)

    expect((await queue())[2]).toMatchObject({ type: 'delete', table: 'clients' })
    expect((await queue())[2].payload).toEqual({ id: 7 })
    expect(await clientsRepo.getById(id)).toBeNull()
  })

  it('applyServerRecord переводит specialization_id в локальный UUID', async () => {
    const specId = await specializationsRepo.save({ name: 'Ремонт' })
    await db.execute('UPDATE specializations SET server_id = ? WHERE id = ?', [5, specId])

    await clientsRepo.applyServerRecord({
      id: 1,
      name: 'Иван',
      phone: '123',
      specialization_id: 5,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    const row = await clientsRepo.findByServerId(1)
    expect(row).toMatchObject({
      name: 'Иван',
      specialization_id: specId,
      specialization_server_id: 5,
      updated_at: seconds(ISO_1),
    })
  })
})

describe('5.3 ordersRepo', () => {
  it('save кладёт заказ и INSERT-операцию; локальный id на сервер не уходит', async () => {
    const clientId = await clientsRepo.save({ name: 'Иван' })
    const id = await ordersRepo.save({ client_id: clientId, total_amount: 1500, hours: 1, minutes: 30 })

    expect(await db.queryOne('SELECT * FROM orders WHERE id = ?', [id])).toMatchObject({
      client_id: clientId,
      total_amount: 1500,
      hours: 1,
      minutes: 30,
      paid: 0,
      status: 'waiting',
    })

    const insertOp = (await queue()).find(operation => operation.table === 'orders')
    expect(insertOp).toMatchObject({ type: 'insert', table: 'orders' })
    expect(insertOp.payload).toMatchObject({ local_id: id, client_id: clientId, total_amount: 1500 })
    expect(insertOp.payload).not.toHaveProperty('id')
  })

  it('update шлёт серверный id, а не локальный UUID (регрессия 3.8)', async () => {
    const id = await ordersRepo.save({ total_amount: 1000 })
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [55, id])

    await ordersRepo.update({ id, total_amount: 2000, comments: 'правка' })

    const updateOp = (await queue()).find(operation => operation.type === 'update')
    expect(updateOp).toMatchObject({ table: 'orders' })
    expect(updateOp.payload.id).toBe(55)
  })

  it('remove снимает синхронизированный заказ, а незаезженный — отменяет INSERT', async () => {
    const synced = await syncedOrder(77)
    await db.execute('DELETE FROM operations')

    await ordersRepo.remove(synced)

    expect((await queue())[0]).toMatchObject({ type: 'delete', table: 'orders' })
    expect((await queue())[0].payload).toEqual({ id: 77 })

    const fresh = await ordersRepo.save({ total_amount: 100 })
    await ordersRepo.remove(fresh)

    expect(
      (await queue()).filter(operation => operation.table === 'orders' && operation.type === 'insert')
    ).toHaveLength(0)
    expect(await db.queryOne('SELECT * FROM orders WHERE id = ?', [fresh])).toBeNull()
  })

  it('applyServerRecord переводит client/specialization/model в локальные UUID', async () => {
    const specId = await specializationsRepo.save({ name: 'Ремонт' })
    await db.execute('UPDATE specializations SET server_id = ? WHERE id = ?', [5, specId])
    const clientId = await clientsRepo.save({ name: 'Иван' })
    await db.execute('UPDATE clients SET server_id = ? WHERE id = ?', [7, clientId])
    const modelId = await modelsRepo.save({ name: 'Bosch' })
    await db.execute('UPDATE equipment_models SET server_id = ? WHERE id = ?', [9, modelId])

    await ordersRepo.applyServerRecord({
      id: 100,
      client_id: 7,
      specialization_id: 5,
      model_id: 9,
      hours: 1,
      minutes: 30,
      total_amount: 2000,
      comments: 'серверный',
      user_id: 3,
      user_order_number: 12,
      status: 'waiting',
      paid: 1,
      share_token: null,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM orders WHERE server_id = ?', [100])).toMatchObject({
      client_id: clientId,
      client_server_id: 7,
      specialization_id: specId,
      specialization_server_id: 5,
      model_id: modelId,
      total_amount: 2000,
      updated_at: seconds(ISO_1),
    })
  })
})

describe('5.3 orderServiceRepo', () => {
  async function addLine() {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const serviceId = await servicesRepo.save({ service: 'Работа', price: 500, category_id: categoryId })
    const orderId = await ordersRepo.save({ total_amount: 100 })

    await orderServiceRepo.add(orderId, serviceId, 500)
    const line = await db.queryOne('SELECT * FROM order_service WHERE order_id = ?', [orderId])

    return { orderId, serviceId, line }
  }

  it('add кладёт строку связки (с ценой работы) и INSERT-операцию', async () => {
    const { orderId, serviceId, line } = await addLine()

    // `sale_price` пишем сразу: иначе офлайн-аналитика считает работы нулём до синка.
    expect(line).toMatchObject({
      order_id: orderId,
      service_id: serviceId,
      quantity: 1,
      sale_price: 500,
      server_id: null,
    })

    const insertOp = (await queue()).find(operation => operation.table === 'order_service')
    expect(insertOp).toMatchObject({ type: 'insert', table: 'order_service' })
    expect(insertOp.payload).toEqual({
      local_id: line.id,
      order_id: orderId,
      service_id: serviceId,
      sale_price: 500,
    })
  })

  it('remove строки, уехавшей на сервер, ставит delete по натуральному ключу (3.5)', async () => {
    const { orderId, serviceId, line } = await addLine()
    await db.execute(
      'UPDATE order_service SET order_server_id = ?, service_server_id = ? WHERE id = ?',
      [100, 200, line.id]
    )

    await orderServiceRepo.remove(orderId, serviceId)

    const deleteOp = (await queue()).find(operation => operation.type === 'delete')
    expect(deleteOp).toMatchObject({ type: 'delete', table: 'order_service' })
    expect(deleteOp.payload).toEqual({ local_id: line.id, order_id: 100, service_id: 200 })
    expect(await db.queryOne('SELECT * FROM order_service WHERE id = ?', [line.id])).toBeNull()
  })

  it('remove незаезженной строки отменяет INSERT, не ставя delete', async () => {
    const { orderId, serviceId, line } = await addLine()

    await orderServiceRepo.remove(orderId, serviceId)

    expect((await queue()).filter(operation => operation.table === 'order_service')).toHaveLength(0)
    expect(await db.queryOne('SELECT * FROM order_service WHERE id = ?', [line.id])).toBeNull()
  })

  it('applyServerRecord находит строку по uuid_id и ставит локальные order/service', async () => {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const serviceId = await servicesRepo.save({ service: 'Работа', price: 500, category_id: categoryId })
    const orderId = await ordersRepo.save({ total_amount: 100 })
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [100, orderId])
    await db.execute('UPDATE services SET server_id = ? WHERE id = ?', [200, serviceId])

    await orderServiceRepo.applyServerRecord({
      uuid_id: 'line-uuid-1',
      order_id: 100,
      service_id: 200,
      sale_price: 500,
      quantity: 1,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM order_service WHERE id = ?', ['line-uuid-1'])).toMatchObject({
      order_id: orderId,
      order_server_id: 100,
      service_id: serviceId,
      service_server_id: 200,
      sale_price: 500,
      updated_at: seconds(ISO_1),
    })
  })
})

describe('5.3 orderProductRepo', () => {
  async function addLine() {
    const productCategoryId = await productCategoriesRepo.save({ name: 'Подшипники' })
    const productId = await productsRepo.save({ name: 'Подшипник', product_category_id: productCategoryId })
    const orderId = await ordersRepo.save({ total_amount: 100 })

    const lineId = await orderProductRepo.add(orderId, productId, 2, 300)

    return { orderId, productId, lineId }
  }

  it('add кладёт строку товара и INSERT-операцию', async () => {
    const { orderId, productId, lineId } = await addLine()

    expect(await db.queryOne('SELECT * FROM order_product WHERE id = ?', [lineId])).toMatchObject({
      order_id: orderId,
      product_id: productId,
      quantity: 2,
      sale_price: 300,
      server_id: null,
    })

    const insertOp = (await queue()).find(operation => operation.table === 'order_product')
    expect(insertOp.payload).toMatchObject({
      local_id: lineId,
      order_id: orderId,
      product_id: productId,
      quantity: 2,
      sale_price: 300,
    })
  })

  it('remove уехавшей строки ставит delete по server_id, незаезженной — отменяет INSERT', async () => {
    const { lineId } = await addLine()

    await orderProductRepo.remove({ id: lineId, server_id: 900 })

    const deleteOp = (await queue()).find(operation => operation.type === 'delete')
    expect(deleteOp.payload).toEqual({ id: 900 })
    expect(await db.queryOne('SELECT * FROM order_product WHERE id = ?', [lineId])).toBeNull()

    const second = await addLine()
    await orderProductRepo.remove({ id: second.lineId, server_id: null })

    // INSERT второй строки отменён; в очереди остались только операции первой строки.
    expect(
      (await queue()).filter(
        operation => operation.table === 'order_product' && operation.type === 'insert'
      )
    ).toHaveLength(1)
    expect(
      (await queue()).find(operation => operation.table === 'order_product' && operation.type === 'insert')
        .payload.local_id
    ).toBe(lineId)
  })

  it('applyServerRecord переводит order_id/product_id в локальные id, view отдаёт amount/price', async () => {
    const productCategoryId = await productCategoriesRepo.save({ name: 'Подшипники' })
    const productId = await productsRepo.save({ name: 'Подшипник', product_category_id: productCategoryId })
    const orderId = await ordersRepo.save({ total_amount: 100 })
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [100, orderId])
    await db.execute('UPDATE products SET server_id = ? WHERE id = ?', [300, productId])

    await orderProductRepo.applyServerRecord({
      id: 900,
      order_id: 100,
      product_id: 300,
      sale_price: 350,
      quantity: 3,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM order_product WHERE server_id = ?', [900])).toMatchObject({
      order_id: orderId,
      product_id: productId,
      sale_price: 350,
      quantity: 3,
      updated_at: seconds(ISO_1),
    })

    // Контракт UI: query отдаёт `quantity AS amount` и `sale_price AS price`.
    const [view] = await orderProductRepo.getByOrderId(orderId)
    expect(view).toMatchObject({ id: productId, amount: 3, price: 350 })
  })
})

describe('5.3 materialsRepo', () => {
  it('add кладёт ручную позицию и INSERT-операцию', async () => {
    const orderId = await ordersRepo.save({ total_amount: 100 })
    const lineId = await materialsRepo.add(orderId, {
      name: 'Клей',
      price: 300,
      amount: 2,
      buy_price: 50,
    })

    expect(await db.queryOne('SELECT * FROM materials WHERE id = ?', [lineId])).toMatchObject({
      order_id: orderId,
      name: 'Клей',
      price: 300,
      amount: 2,
      buy_price: 50,
      server_id: null,
    })

    const insertOp = (await queue()).find(operation => operation.table === 'materials')
    expect(insertOp.payload).toEqual({
      local_id: lineId,
      order_id: orderId,
      name: 'Клей',
      price: 300,
      amount: 2,
      buy_price: 50,
    })
  })

  it('remove незаезженной позиции отменяет INSERT', async () => {
    const orderId = await ordersRepo.save({ total_amount: 100 })
    const lineId = await materialsRepo.add(orderId, { name: 'Клей', price: 300, amount: 2 })

    await materialsRepo.remove({ id: lineId, server_id: null })

    expect((await queue()).filter(operation => operation.table === 'materials')).toHaveLength(0)
    expect(await db.queryOne('SELECT * FROM materials WHERE id = ?', [lineId])).toBeNull()
  })

  it('applyServerRecord находит локальный заказ по server_id', async () => {
    const orderId = await ordersRepo.save({ total_amount: 100 })
    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [100, orderId])

    await materialsRepo.applyServerRecord({
      id: 5,
      order_id: 100,
      name: 'Клей',
      price: 300,
      amount: 2,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM materials WHERE server_id = ?', [5])).toMatchObject({
      order_id: orderId,
      order_server_id: 100,
      name: 'Клей',
      price: 300,
      amount: 2,
      updated_at: seconds(ISO_1),
    })
  })
})
