// test/repositories-catalog.test.js
//
// Задача 5.3: репозитории каталога — save/update/remove пишут запись в БД **и**
// операцию в очередь синка, а `applyServerRecord` применяет серверные записи
// (server_id → локальный UUID для внешних ключей).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as modelsRepo from 'src/repositories/modelsRepo.js'

/** Очередь операций в порядке постановки (rowid) с распарсенным payload. */
async function queue() {
  const rows = await db.query('SELECT *, rowid AS _rowid FROM operations ORDER BY _rowid ASC')
  return rows.map(row => ({ ...row, payload: JSON.parse(row.payload) }))
}

const ISO_1 = '2026-09-12T10:00:00.000Z'
const ISO_OLD = '2026-09-12T09:00:00.000Z'
const seconds = value => Math.floor(Date.parse(value) / 1000)

beforeEach(async () => {
  await setupTestDb()
})

describe('5.3 specializationsRepo', () => {
  it('save кладёт запись в БД и INSERT-операцию с local_id (без локального id)', async () => {
    const id = await specializationsRepo.save({ name: 'Ремонт' })

    const row = await db.queryOne('SELECT * FROM specializations WHERE id = ?', [id])
    expect(row).toMatchObject({ name: 'Ремонт', server_id: null })

    const operations = await queue()
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({ type: 'insert', table: 'specializations', status: 'pending' })
    expect(operations[0].payload).toMatchObject({ local_id: id, name: 'Ремонт' })
    expect(operations[0].payload).not.toHaveProperty('id')
  })

  it('update/remove ставят операцию только для записи с server_id', async () => {
    const id = await specializationsRepo.save({ name: 'Ремонт' })

    // Пока server_id нет — новых операций быть не должно (INSERT уже в очереди).
    await specializationsRepo.update({ id, name: 'Ремонт-2' })
    await db.execute('UPDATE specializations SET server_id = ? WHERE id = ?', [42, id])
    await specializationsRepo.update({ id, name: 'Ремонт-3' })

    let operations = await queue()
    expect(operations).toHaveLength(2)
    expect(operations[1]).toMatchObject({ type: 'update', table: 'specializations' })
    // Фаза 10 (10.6): в payload едут и поля профиля.
    expect(operations[1].payload).toEqual({
      id: 42,
      name: 'Ремонт-3',
      preset_key: null,
      accent: null,
      features: null,
      archived: 0,
      template_version: null,
    })

    await specializationsRepo.remove(id)

    operations = await queue()
    expect(operations[2]).toMatchObject({ type: 'delete', table: 'specializations' })
    expect(operations[2].payload).toEqual({ id: 42 })
    expect(await db.queryOne('SELECT * FROM specializations WHERE id = ?', [id])).toBeNull()
  })

  it('remove незаезженной записи отменяет INSERT и не ставит delete', async () => {
    const id = await specializationsRepo.save({ name: 'Ремонт' })
    await specializationsRepo.remove(id)

    expect(await queue()).toHaveLength(0)
    expect(await db.queryOne('SELECT * FROM specializations WHERE id = ?', [id])).toBeNull()
  })

  it('applyServerRecord сохраняет секунды и не перетирает более свежую версию', async () => {
    await specializationsRepo.applyServerRecord({
      id: 7,
      name: 'Серверная',
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    const row = await db.queryOne('SELECT * FROM specializations WHERE server_id = ?', [7])
    expect(row).toMatchObject({ name: 'Серверная', updated_at: seconds(ISO_1) })

    await specializationsRepo.applyServerRecord({ id: 7, name: 'Старая', updated_at: ISO_OLD })
    expect((await db.queryOne('SELECT name FROM specializations WHERE server_id = ?', [7])).name).toBe(
      'Серверная'
    )
  })

  it('updateServerId проставляет серверный id (нужен для FK-детей)', async () => {
    const id = await specializationsRepo.save({ name: 'Ремонт' })
    await specializationsRepo.updateServerId(id, 99)

    expect((await db.queryOne('SELECT server_id FROM specializations WHERE id = ?', [id])).server_id).toBe(99)
  })
})

describe('5.3 categoriesRepo', () => {
  it('save кладёт запись и INSERT-операцию; remove снимает строку с сервера', async () => {
    const id = await categoriesRepo.save({ category_name: 'Диагностика', specialization_id: null })

    const row = await db.queryOne('SELECT * FROM categories WHERE id = ?', [id])
    expect(row).toMatchObject({ category_name: 'Диагностика', server_id: null })

    let operations = await queue()
    expect(operations[0]).toMatchObject({ type: 'insert', table: 'categories' })
    expect(operations[0].payload).toMatchObject({ local_id: id, category_name: 'Диагностика' })

    await db.execute('UPDATE categories SET server_id = ? WHERE id = ?', [11, id])
    await categoriesRepo.remove(id)

    operations = await queue()
    expect(operations[1]).toMatchObject({ type: 'delete', table: 'categories' })
    expect(operations[1].payload).toEqual({ id: 11 })
    expect(await db.queryOne('SELECT * FROM categories WHERE id = ?', [id])).toBeNull()
  })

  it('applyServerRecord создаёт запись по server_id', async () => {
    await categoriesRepo.applyServerRecord({
      id: 5,
      category_name: 'Электрика',
      specialization_id: 3,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM categories WHERE server_id = ?', [5])).toMatchObject({
      category_name: 'Электрика',
      updated_at: seconds(ISO_1),
    })
  })
})

describe('5.3 servicesRepo', () => {
  it('save кладёт запись и INSERT-операцию; без категории — понятная ошибка схемы', async () => {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const id = await servicesRepo.save({ service: 'Диагностика', price: 1500, category_id: categoryId })

    expect(await db.queryOne('SELECT * FROM services WHERE id = ?', [id])).toMatchObject({
      service: 'Диагностика',
      price: 1500,
      category_id: categoryId,
    })

    const operations = await queue()
    const insertOp = operations.find(operation => operation.table === 'services')
    expect(insertOp).toMatchObject({ type: 'insert', table: 'services' })
    expect(insertOp.payload).toMatchObject({
      local_id: id,
      service: 'Диагностика',
      category_id: categoryId,
    })

    // Категория обязательна в локальной схеме (`category_id NOT NULL`). Важно, что
    // ошибка — понятная (ограничение схемы), а не «tried to bind a value of an
    // unknown type (undefined)» из sql.js.
    await expect(servicesRepo.save({ service: 'Без категории', price: 100 })).rejects.toThrow(
      /NOT NULL constraint failed: services\.category_id/
    )
  })

  it('applyServerRecord переводит server_id категории в локальный UUID', async () => {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    await db.execute('UPDATE categories SET server_id = ? WHERE id = ?', [5, categoryId])

    await servicesRepo.applyServerRecord({
      id: 9,
      category_id: 5,
      service: 'Стрижка',
      price: 1000,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM services WHERE server_id = ?', [9])).toMatchObject({
      service: 'Стрижка',
      category_id: categoryId,
      updated_at: seconds(ISO_1),
    })
  })

  it('applyServerRecord пропускает услугу, если локальной категории ещё нет', async () => {
    // Пока категория не приехала, услугу применять некуда — запись пропускается.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await servicesRepo.applyServerRecord({ id: 9, category_id: 404, service: 'Стрижка', price: 1000 })

    expect(await db.queryOne('SELECT * FROM services WHERE server_id = ?', [9])).toBeNull()
    spy.mockRestore()
  })

  it('remove снимает строку с сервера, если она уже уезжала', async () => {
    const categoryId = await categoriesRepo.save({ category_name: 'Электрика' })
    const id = await servicesRepo.save({ service: 'Диагностика', price: 1500, category_id: categoryId })
    await db.execute('UPDATE services SET server_id = ? WHERE id = ?', [21, id])

    await servicesRepo.remove(id)

    const deleteOp = (await queue()).find(operation => operation.type === 'delete')
    expect(deleteOp).toMatchObject({ type: 'delete', table: 'services' })
    expect(deleteOp.payload).toEqual({ id: 21 })
    expect(await db.queryOne('SELECT * FROM services WHERE id = ?', [id])).toBeNull()
  })
})

describe('5.3 productCategoriesRepo', () => {
  it('save кладёт запись и операцию, applyServerRecord — строку по server_id', async () => {
    const id = await productCategoriesRepo.save({ name: 'Подшипники', specialization_id: null })

    expect(await db.queryOne('SELECT * FROM product_categories WHERE id = ?', [id])).toMatchObject({
      name: 'Подшипники',
    })
    expect((await queue())[0]).toMatchObject({ type: 'insert', table: 'product_categories' })

    await productCategoriesRepo.applyServerRecord({
      id: 3,
      name: 'Подшипники',
      specialization_id: null,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    const fromServer = await db.queryOne('SELECT * FROM product_categories WHERE server_id = ?', [3])
    expect(fromServer).toMatchObject({ name: 'Подшипники', updated_at: seconds(ISO_1) })
    expect(await productCategoriesRepo.getLocalIdByServerId(3)).toBe(fromServer.id)
  })
})

describe('5.3 productsRepo', () => {
  it('save кладёт запись, операцию и сигнальное поле product_category_server_id', async () => {
    const categoryId = await productCategoriesRepo.save({ name: 'Подшипники' })
    const id = await productsRepo.save({
      name: 'Подшипник 6204',
      product_category_id: categoryId,
      base_sale_price: 300,
      description: '',
      manufacturer: 'SKF',
      product_number: '6204',
      weight: 0.05,
    })

    expect(await db.queryOne('SELECT * FROM products WHERE id = ?', [id])).toMatchObject({
      name: 'Подшипник 6204',
      product_category_id: categoryId,
      server_id: null,
    })

    const insertOp = (await queue()).find(operation => operation.table === 'products')
    expect(insertOp).toMatchObject({ type: 'insert', table: 'products' })
    expect(insertOp.payload).toMatchObject({ local_id: id, product_category_id: categoryId })
    // Сигнальное поле есть, но null: категория ещё не на сервере (кейс 3.4) —
    // syncService переведёт локальный id, а не примет null за готовый FK.
    expect(insertOp.payload).toHaveProperty('product_category_server_id', null)
  })

  it('applyServerRecord переводит server_id товарной категории в локальный UUID', async () => {
    await productCategoriesRepo.applyServerRecord({
      id: 3,
      name: 'Подшипники',
      specialization_id: null,
      created_at: ISO_1,
      updated_at: ISO_1,
    })
    const localCategoryId = await productCategoriesRepo.getLocalIdByServerId(3)

    await productsRepo.applyServerRecord({
      id: 20,
      name: 'Подшипник 6204',
      description: '',
      manufacturer: 'SKF',
      product_number: '6204',
      weight: 0.05,
      base_sale_price: 300,
      product_category_id: 3,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM products WHERE server_id = ?', [20])).toMatchObject({
      name: 'Подшипник 6204',
      product_category_id: localCategoryId,
      product_category_server_id: 3,
      updated_at: seconds(ISO_1),
    })
  })

  it('remove незаезженного товара отменяет его INSERT', async () => {
    const categoryId = await productCategoriesRepo.save({ name: 'Подшипники' })
    const id = await productsRepo.save({ name: 'Подшипник 6204', product_category_id: categoryId })

    await productsRepo.remove(id)

    // Отменён именно INSERT товара; INSERT его категории в очереди остаётся.
    expect((await queue()).filter(operation => operation.table === 'products')).toHaveLength(0)
    expect(await db.queryOne('SELECT * FROM products WHERE id = ?', [id])).toBeNull()
  })
})

describe('5.3 modelsRepo', () => {
  it('save ставит операцию, applyServerRecord переводит specialization_id в локальный UUID', async () => {
    const specId = await specializationsRepo.save({ name: 'Ремонт' })
    await db.execute('UPDATE specializations SET server_id = ? WHERE id = ?', [5, specId])

    const id = await modelsRepo.save({ name: 'Bosch WAN24', specialization_id: specId })
    const insertOp = (await queue()).find(operation => operation.table === 'equipment_models')
    expect(insertOp).toMatchObject({ type: 'insert', table: 'equipment_models' })
    expect(insertOp.payload).toMatchObject({ local_id: id, specialization_id: specId })

    await modelsRepo.applyServerRecord({
      id: 30,
      name: 'Bosch WAN24',
      specialization_id: 5,
      created_at: ISO_1,
      updated_at: ISO_1,
    })

    expect(await db.queryOne('SELECT * FROM equipment_models WHERE server_id = ?', [30])).toMatchObject({
      name: 'Bosch WAN24',
      specialization_id: specId,
      specialization_server_id: 5,
      updated_at: seconds(ISO_1),
    })
  })
})
