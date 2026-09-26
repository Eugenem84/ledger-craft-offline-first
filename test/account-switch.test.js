// test/account-switch.test.js
//
// Дефекты живого прогона (задача 11.6), найденные на dev:
//   1) счётчик вкладки «обзор» в карточке заказа не учитывал работы — при добавлении
//      работы он оставался 0 (`positionsCount` в `useOrderDraftStore`);
//   2) смена аккаунта на устройстве. Локальная БД и очередь операций общие для всех
//      пользователей, а `syncService.fullReset()` очередь не чистил: после входа другим
//      аккаунтом его операции уезжали под новым токеном, а курсоры синка оставались
//      от прежнего владельца (новый аккаунт видел лишь свежие записи).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import { apiClient } from 'src/services/api.js'
import storage from 'src/utils/storage.js'
import syncService from 'src/services/syncService.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'
import * as modelsRepo from 'src/repositories/modelsRepo.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'
import { v4 as uuidv4 } from 'uuid'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

function clearAuthStorage() {
  for (const key of [
    'auth_token',
    'auth_user',
    'auth_owner_id',
    'auth_pin_hash',
    'auth_pin_salt',
  ]) {
    storage.removeItem(key)
  }
}

describe('счётчик вкладки «обзор»: работы + материалы + товары', () => {
  it('positionsCount учитывает работу, материал и товар', () => {
    setActivePinia(createPinia())
    const draft = useOrderDraftStore()

    expect(draft.positionsCount).toBe(0)

    draft.services = [{ id: 's1', price: 500 }]
    expect(draft.positionsCount).toBe(1)

    draft.materials = [{ id: 'm1', price: 100, amount: 2 }]
    draft.products = [{ id: 'p1', price: 1000, amount: 1 }]
    expect(draft.positionsCount).toBe(3)
  })

  it('вкладка «обзор» берёт счётчик из стора, а не из materials+products', () => {
    const page = read('src/pages/OrderDetailsPage.vue')

    expect(page).toContain('`обзор · ${positionsCount}`')
    expect(page).not.toContain('materials?.length')
  })
})

describe('смена аккаунта: локальные данные не переезжают в новый аккаунт', () => {
  beforeEach(clearAuthStorage)

  afterEach(() => {
    vi.restoreAllMocks()
    clearAuthStorage()
  })

  async function loginAs(user, token) {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { access_token: token, user } })

    setActivePinia(createPinia())
    const auth = useAuthStore()
    await auth.login(user.email, 'secret')
    return auth
  }

  it('вход другим аккаунтом сбрасывает локальные данные и запоминает нового владельца', async () => {
    const reset = vi.spyOn(syncService, 'fullReset').mockResolvedValue(undefined)
    storage.setItem('auth_owner_id', '1')

    await loginAs({ id: 2, name: 'Другой', email: 'b@example.com' }, 'tok-b')

    expect(reset).toHaveBeenCalledTimes(1)
    expect(storage.getItem('auth_owner_id')).toBe('2')
  })

  it('повторный вход тем же аккаунтом офлайн-данные не трогает', async () => {
    const reset = vi.spyOn(syncService, 'fullReset').mockResolvedValue(undefined)
    storage.setItem('auth_owner_id', '1')

    await loginAs({ id: 1, name: 'Свой', email: 'a@example.com' }, 'tok-a')

    expect(reset).not.toHaveBeenCalled()
    expect(storage.getItem('auth_owner_id')).toBe('1')
  })

  it('сбой сброса отменяет вход и не запоминает нового владельца (иначе чужие данные «закрепятся»)', async () => {
    const reset = vi.spyOn(syncService, 'fullReset').mockRejectedValue(new Error('boom'))
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { access_token: 'tok-b', user: { id: 2, name: 'Другой', email: 'b@example.com' } },
    })
    storage.setItem('auth_owner_id', '1')

    setActivePinia(createPinia())
    const auth = useAuthStore()

    await expect(auth.login('b@example.com', 'secret')).rejects.toThrow(/прежнего аккаунта/)

    expect(reset).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(storage.getItem('auth_owner_id')).toBe('1')
    expect(auth.error).toMatch(/прежнего аккаунта/)
  })
})

// Все локальные таблицы данных. Порядок — «дети → родители»: если `fullReset()`
// удалит родителей первыми, на устройстве с `PRAGMA foreign_keys = ON` он упадёт,
// а данные прежнего аккаунта останутся (задача 14.18).
const ALL_LOCAL_TABLES = [
  'order_service',
  'order_product',
  'materials',
  'sales_products_prices',
  'incoming_products',
  'buy_product_prices',
  'product_stocks',
  'orders',
  'services',
  'products',
  'categories',
  'product_categories',
  'equipment_models',
  'clients',
  'specializations',
]

async function countRows(table) {
  const rows = await db.query(`SELECT COUNT(*) AS total FROM ${table}`)
  return rows.length ? rows[0].total : 0
}

/** Заполняет ВСЕ таблицы локальной БД данными «предыдущего аккаунта». */
async function seedEverything() {
  const specializationId = await specializationsRepo.save({ name: 'Ремонт' })
  const categoryId = await categoriesRepo.save({
    category_name: 'Двигатель',
    specialization_id: specializationId,
  })
  const serviceId = await servicesRepo.save({
    service: 'Замена масла',
    price: 500,
    category_id: categoryId,
  })
  const clientId = await clientsRepo.save({
    name: 'Иван',
    phone: '123',
    specialization_id: specializationId,
  })
  const productCategoryId = await productCategoriesRepo.save({
    name: 'Фильтры',
    specialization_id: specializationId,
  })
  const productId = await productsRepo.save({
    name: 'Фильтр',
    base_sale_price: 300,
    product_category_id: productCategoryId,
  })
  await modelsRepo.save({ name: 'Кросс', specialization_id: specializationId })

  const at = Math.floor(Date.now() / 1000)

  await db.execute(
    `INSERT INTO orders (id, specialization_id, client_id, total_amount, status, paid, created_at, updated_at)
     VALUES (?, ?, ?, 0, 'waiting', 0, ?, ?)`,
    ['order-1', specializationId, clientId, at, at]
  )
  await db.execute(
    `INSERT INTO order_service (id, order_id, service_id, sale_price, quantity, created_at, updated_at)
     VALUES (?, ?, ?, 500, 1, ?, ?)`,
    [uuidv4(), 'order-1', serviceId, at, at]
  )
  await db.execute(
    `INSERT INTO order_product (id, order_id, product_id, sale_price, quantity, created_at, updated_at)
     VALUES (?, ?, ?, 300, 1, ?, ?)`,
    [uuidv4(), 'order-1', productId, at, at]
  )
  await db.execute(
    `INSERT INTO materials (id, order_id, name, price, amount, created_at, updated_at)
     VALUES (?, ?, 'Герметик', 50, 2, ?, ?)`,
    [uuidv4(), 'order-1', at, at]
  )
  await db.execute(
    `INSERT INTO sales_products_prices (id, order_id, product_id, sale_price, created_at, updated_at)
     VALUES (?, ?, ?, 300, ?, ?)`,
    [uuidv4(), 'order-1', productId, at, at]
  )
  await db.execute(
    `INSERT INTO incoming_products (id, product_id, supplier, quantity, by_price, created_at, updated_at)
     VALUES (?, ?, '', 5, 100, ?, ?)`,
    [uuidv4(), productId, at, at]
  )
  await db.execute(
    `INSERT INTO buy_product_prices (id, product_id, buy_price, created_at, updated_at)
     VALUES (?, ?, 100, ?, ?)`,
    [uuidv4(), productId, at, at]
  )
  await db.execute(
    `INSERT INTO product_stocks (id, product_id, quantity, supplier, created_at, updated_at)
     VALUES (?, ?, 5, '', ?, ?)`,
    [uuidv4(), productId, at, at]
  )

  return { specializationId, serviceId, clientId, productId }
}

describe('14.18 полный сброс: очередь, курсоры и ВСЕ таблицы данных', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('у каждой таблицы синка есть clearAll()', () => {
    for (const [table, repo] of Object.entries(syncService.repos)) {
      expect(typeof repo.clearAll, `нет clearAll() у таблицы ${table}`).toBe('function')
    }
  })

  it('после fullReset() не остаётся ни одной строки — ни заказов, ни клиентов, ни каталога', async () => {
    await seedEverything()
    await operationsRepo.enqueue(['op-1', 'insert', 'orders', '{"local_id":"x"}', 1000])
    await db.execute('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
      'last_synced_at:orders',
      '123',
    ])

    // Страховка: данные действительно записаны (иначе тест «зелёный» на пустой БД).
    expect(await countRows('orders')).toBe(1)
    expect(await countRows('clients')).toBe(1)
    expect(await countRows('specializations')).toBe(1)

    await syncService.fullReset()

    for (const table of ALL_LOCAL_TABLES) {
      expect(await countRows(table), `таблица ${table} должна быть пуста`).toBe(0)
    }

    expect(await operationsRepo.countPending()).toBe(0)
    expect(
      await db.query('SELECT * FROM meta WHERE key = ?', ['last_synced_at:orders'])
    ).toHaveLength(0)
  })
})
