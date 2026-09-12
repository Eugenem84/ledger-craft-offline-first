// test/phase10-schema.test.js
//
// Фаза 10: схема и сквозной путь полей профиля. Проверяем, что новые колонки
// появились (миграции 025/026/027), поля профиля переживают сохранение/синк,
// `template_key` проезжает через `applyServerRecord`, архивирование — это флаг,
// а `equipment_identifier` сохраняется и приезжает из выдачи.
import { describe, it, expect, beforeEach } from 'vitest'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as ordersRepo from 'src/repositories/ordersRepo.js'

async function columnNames(table) {
  const rows = await db.query(`PRAGMA table_info(${table})`)
  return rows.map(row => row.name)
}

const seconds = value => Math.floor(Date.parse(value) / 1000)

describe('10.6/10.9 схема и поля профиля', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('миграции 025/026/027 добавили колонки', async () => {
    expect(await columnNames('specializations')).toEqual(
      expect.arrayContaining(['preset_key', 'accent', 'features', 'archived', 'template_version'])
    )

    for (const table of ['categories', 'product_categories', 'equipment_models']) {
      expect(await columnNames(table), `template_key в ${table}`).toContain('template_key')
    }

    expect(await columnNames('orders')).toContain('equipment_identifier')
  })

  it('поля профиля сохраняются локально (features — из объекта в строку)', async () => {
    const id = await specializationsRepo.save({
      name: 'Веломастерская',
      preset_key: 'bike',
      accent: '#4caf50',
      features: { store: true, analytics: false },
      archived: 0,
      template_version: 1,
    })

    const row = await db.queryOne('SELECT * FROM specializations WHERE id = ?', [id])
    expect(row).toMatchObject({
      preset_key: 'bike',
      accent: '#4caf50',
      archived: 0,
      template_version: 1,
    })
    expect(JSON.parse(row.features)).toMatchObject({ store: true, analytics: false })

    // В очередь уехали те же поля (объект сериализуется в JSON).
    const op = await db.queryOne(
      'SELECT payload FROM operations WHERE "table" = \'specializations\' ORDER BY rowid LIMIT 1'
    )
    const payload = JSON.parse(op.payload)
    expect(payload).toMatchObject({ name: 'Веломастерская', preset_key: 'bike', accent: '#4caf50' })
    expect(typeof payload.features).toBe('string')
  })

  it('правка профиля обновляет и локальную запись, и операцию для сервера', async () => {
    const id = await specializationsRepo.save({ name: 'Старое', preset_key: 'bike' })
    await db.execute('UPDATE specializations SET server_id = ? WHERE id = ?', [77, id])

    await specializationsRepo.update({
      id,
      name: 'Новое',
      preset_key: 'auto',
      accent: '#ff7043',
      features: '{"store":true}',
      archived: 0,
      template_version: 1,
    })

    const row = await db.queryOne('SELECT * FROM specializations WHERE id = ?', [id])
    expect(row).toMatchObject({ name: 'Новое', preset_key: 'auto', accent: '#ff7043' })

    const op = await db.queryOne(
      'SELECT payload FROM operations WHERE "table" = \'specializations\' AND type = \'update\''
    )
    expect(JSON.parse(op.payload)).toMatchObject({
      id: 77,
      name: 'Новое',
      preset_key: 'auto',
      accent: '#ff7043',
    })
  })

  it('архивирование — это флаг, запись и история остаются', async () => {
    const id = await specializationsRepo.save({ name: 'Аквариумы' })
    await specializationsRepo.update({ id, name: 'Аквариумы', archived: 1 })

    const row = await db.queryOne('SELECT * FROM specializations WHERE id = ?', [id])
    expect(row.archived).toBe(1)

    const all = await specializationsRepo.getAll()
    expect(all.map(item => item.id)).toContain(id)
  })

  it('applyServerRecord приносит поля профиля и уважает LWW', async () => {
    await specializationsRepo.applyServerRecord({
      id: 5,
      name: 'Из сервера',
      preset_key: 'hvac',
      accent: '#42a5f5',
      features: '{"models":false}',
      archived: 0,
      template_version: 2,
      created_at: '2026-09-12T10:00:00.000Z',
      updated_at: '2026-09-12T10:00:00.000Z',
    })

    const local = await db.queryOne('SELECT * FROM specializations WHERE server_id = ?', [5])
    expect(local).toMatchObject({ preset_key: 'hvac', accent: '#42a5f5', template_version: 2 })
    expect(local.created_at).toBe(seconds('2026-09-12T10:00:00.000Z'))

    // Более старая версия не перетирает локальную.
    await specializationsRepo.applyServerRecord({
      id: 5,
      name: 'Устаревшая',
      preset_key: 'bike',
      updated_at: '2026-09-12T09:00:00.000Z',
    })
    const still = await db.queryOne('SELECT * FROM specializations WHERE server_id = ?', [5])
    expect(still.name).toBe('Из сервера')

    // Более свежая — применяется.
    await specializationsRepo.applyServerRecord({
      id: 5,
      name: 'Свежая',
      preset_key: 'auto',
      accent: '#ff7043',
      features: '{"store":true}',
      archived: 0,
      template_version: 1,
      updated_at: '2026-09-12T11:00:00.000Z',
    })
    const updated = await db.queryOne('SELECT * FROM specializations WHERE server_id = ?', [5])
    expect(updated).toMatchObject({ name: 'Свежая', preset_key: 'auto' })
  })

  it('template_key приезжает от сервера в каталог (идемпотентность на втором устройстве)', async () => {
    await categoriesRepo.applyServerRecord({
      id: 10,
      specialization_id: 5,
      category_name: 'Колёса',
      template_key: 'bike:wheels',
      created_at: '2026-09-12T10:00:00.000Z',
      updated_at: '2026-09-12T10:00:00.000Z',
    })

    const row = await db.queryOne('SELECT * FROM categories WHERE server_id = ?', [10])
    expect(row.template_key).toBe('bike:wheels')
  })

  it('equipment_identifier сохраняется, обновляется и синкается (10.9)', async () => {
    const id = await ordersRepo.save({
      specialization_id: null,
      client_id: null,
      model_id: null,
      status: 'waiting',
      paid: 0,
      equipment_identifier: 'VIN-123',
    })

    let row = await db.queryOne('SELECT * FROM orders WHERE id = ?', [id])
    expect(row.equipment_identifier).toBe('VIN-123')

    const op = await db.queryOne(
      'SELECT payload FROM operations WHERE "table" = \'orders\' AND type = \'insert\''
    )
    expect(JSON.parse(op.payload).equipment_identifier).toBe('VIN-123')

    await db.execute('UPDATE orders SET server_id = ? WHERE id = ?', [900, id])
    await ordersRepo.update({
      id,
      specialization_id: null,
      client_id: null,
      status: 'process',
      paid: 0,
      equipment_identifier: 'VIN-456',
    })

    row = await db.queryOne('SELECT * FROM orders WHERE id = ?', [id])
    expect(row.equipment_identifier).toBe('VIN-456')

    // Запись с сервера: значение приезжает на второе устройство.
    await ordersRepo.applyServerRecord({
      id: 901,
      specialization_id: null,
      client_id: null,
      status: 'waiting',
      paid: 0,
      equipment_identifier: 'АДРЕС-777',
      created_at: '2026-09-12T10:00:00.000Z',
      updated_at: '2026-09-12T10:00:00.000Z',
    })

    const fromServer = await db.queryOne('SELECT * FROM orders WHERE server_id = ?', [901])
    expect(fromServer.equipment_identifier).toBe('АДРЕС-777')
  })
})

