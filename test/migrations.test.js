// test/migrations.test.js
//
// Задача 5.5: прогнать все миграции на чистой БД и убедиться, что схема Фазы 2
// стабильна — нет дублей, конфликтов колонок и «разъехавшихся» имён.
import { describe, it, expect } from 'vitest'
import { runMigrations } from 'src/database/migrate.js'
import migrations from 'src/database/migrations/index.js'
import m022 from 'src/database/migrations/022_add_operations_status.js'
import { createSqlJsAdapter, setupTestDb, SCHEMA_VERSION } from './helpers/testDb.js'

async function tableNames(adapter) {
  const rows = await adapter.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
  )
  return rows.map(row => row.name)
}

async function columnNames(adapter, table) {
  const rows = await adapter.query(`PRAGMA table_info(${table})`)
  return rows.map(row => row.name)
}

describe('5.5 Миграции локальной БД', () => {
  it('SCHEMA_VERSION равен числу миграций, id уникальны', () => {
    const ids = migrations.map(migration => migration.id)

    expect(SCHEMA_VERSION).toBe(migrations.length)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
  })

  it('на чистой БД применяются все миграции, повторный прогон — ни одной', async () => {
    const adapter = await createSqlJsAdapter()
    await adapter.init()

    const applied = await runMigrations(adapter)
    expect(applied).toBe(SCHEMA_VERSION)

    const second = await runMigrations(adapter)
    expect(second).toBe(0)

    const [{ total }] = await adapter.query('SELECT COUNT(*) AS total FROM migrations')
    expect(Number(total)).toBe(SCHEMA_VERSION)
  })

  it('схема содержит все таблицы Фазы 2', async () => {
    const adapter = await setupTestDb()

    expect(await tableNames(adapter)).toEqual(
      [
        'buy_product_prices',
        'categories',
        'clients',
        'equipment_models',
        'incoming_products',
        'materials',
        'meta',
        'migrations',
        'operations',
        'order_product',
        'order_service',
        'orders',
        'product_categories',
        'product_stocks',
        'products',
        'sales_products_prices',
        'services',
        'specializations',
      ].sort()
    )
  })

  it('нет «фейковых» таблиц-дублей order_material / справочника materials (2.1, 3.4)', async () => {
    const adapter = await setupTestDb()
    const names = await tableNames(adapter)

    expect(names).not.toContain('order_material')
    expect(names).not.toContain('materials_legacy')

    // `materials` — строки заказа (решение D2), а не клиентский справочник:
    // колонки `specialization_id` (признак справочника) быть не должно.
    const columns = await columnNames(adapter, 'materials')
    expect(columns).toEqual(
      expect.arrayContaining(['order_id', 'name', 'price', 'amount', 'server_id'])
    )
    expect(columns).not.toContain('specialization_id')
  })

  it('order_product использует единые имена quantity/sale_price (2.2)', async () => {
    const adapter = await setupTestDb()
    const columns = await columnNames(adapter, 'order_product')

    expect(columns).toContain('quantity')
    expect(columns).toContain('sale_price')
    expect(columns).not.toContain('amount')
    expect(columns).not.toContain('price')
  })

  it('buy_price в позициях заказа: обе позиции (9.5/9.6)', async () => {
    const adapter = await setupTestDb()

    // Себестоимость на момент продажи: у товара со склада и у ручной позиции.
    // У работ (`order_service`) её нет — это труд мастера, маржа равна цене позиции.
    expect(await columnNames(adapter, 'order_product')).toContain('buy_price')
    expect(await columnNames(adapter, 'materials')).toContain('buy_price')
    expect(await columnNames(adapter, 'order_service')).not.toContain('buy_price')
  })

  it('миграция 024 идемпотентна на «старой» БД и не портит данные', async () => {
    const adapter = await createSqlJsAdapter()
    await adapter.init()

    // Имитируем БД «до 9.5»: те же таблицы, но без `buy_price` (как было до миграции).
    await adapter.execute(`
      CREATE TABLE order_product (
        id TEXT PRIMARY KEY, server_id BIGINT, order_id TEXT NOT NULL, product_id TEXT NOT NULL,
        sale_price INTEGER NOT NULL, quantity INTEGER NOT NULL, created_at INTEGER, updated_at INTEGER, deleted_at INTEGER
      )
    `)
    await adapter.execute(`
      CREATE TABLE materials (
        id TEXT PRIMARY KEY, server_id INTEGER, order_id TEXT, order_server_id INTEGER,
        name TEXT, price REAL, amount INTEGER, created_at INTEGER, updated_at INTEGER, deleted_at INTEGER
      )
    `)
    await adapter.execute(
      "INSERT INTO order_product (id, order_id, product_id, sale_price, quantity) VALUES ('op-1', 'o-1', 'p-1', 1000, 2)"
    )
    await adapter.execute(
      "INSERT INTO materials (id, order_id, name, price, amount) VALUES ('m-1', 'o-1', 'Клей', 200, 1)"
    )

    // Миграцию зовём напрямую: в списке она уже «применена» только на чистой БД.
    const migration = (await import('src/database/migrations/024_order_lines_buy_price.js')).default

    await migration.up(adapter)
    await migration.up(adapter) // повтор — колонки уже есть, ошибки быть не должно

    expect(await columnNames(adapter, 'order_product')).toContain('buy_price')
    expect(await columnNames(adapter, 'materials')).toContain('buy_price')
    // Данные на месте: закупка пока неизвестна (`NULL`), а не нулевая.
    const line = await adapter.queryOne('SELECT * FROM order_product WHERE id = ?', ['op-1'])
    expect(line).toMatchObject({ sale_price: 1000, quantity: 2, buy_price: null })
  })

  it('operations имеет status, updated_at (3.3) и attempts (12), версия схемы записана в БД (4.5)', async () => {
    const adapter = await setupTestDb()
    const columns = await columnNames(adapter, 'operations')

    expect(columns).toEqual(expect.arrayContaining(['status', 'updated_at', 'attempts']))
    expect(await adapter.getSchemaVersion()).toBe(SCHEMA_VERSION)
  })

  it('022_add_operations_status идемпотентна на «старой» БД без колонок', async () => {
    const adapter = await createSqlJsAdapter()
    await adapter.init()

    // Таблица в том виде, в каком её видели установки до 3.3.
    await adapter.execute(`
      CREATE TABLE operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        "table" TEXT NOT NULL,
        payload TEXT,
        created_at INTEGER
      )
    `)

    await m022.up(adapter)

    const afterFirst = await columnNames(adapter, 'operations')
    expect(afterFirst).toContain('status')
    expect(afterFirst).toContain('updated_at')

    // Повторный прогон не должен упасть на «duplicate column name».
    await m022.up(adapter)

    const afterSecond = await columnNames(adapter, 'operations')
    expect(afterSecond.filter(name => name === 'status')).toHaveLength(1)
    expect(afterSecond.filter(name => name === 'updated_at')).toHaveLength(1)
  })

  it('таблицы синка имеют server_id и timestamps, как ожидает syncService', async () => {
    const adapter = await setupTestDb()

    for (const table of [
      'specializations',
      'categories',
      'services',
      'product_categories',
      'products',
      'equipment_models',
      'clients',
      'orders',
      'order_product',
      'materials',
    ]) {
      const columns = await columnNames(adapter, table)
      expect(columns, `таблица ${table}`).toEqual(
        expect.arrayContaining(['id', 'server_id', 'created_at', 'updated_at'])
      )
    }

    // `order_service` — связка без собственного server_id на сервере, но локально
    // колонка есть (её оставляет INSERT FROM SERVER / updateServerId).
    expect(await columnNames(adapter, 'order_service')).toEqual(
      expect.arrayContaining(['id', 'order_id', 'service_id', 'order_server_id', 'service_server_id'])
    )
  })
})
