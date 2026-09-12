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
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'

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
})

describe('fullReset чистит и таблицы, и очередь операций, и курсоры синка', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('очередь предыдущего аккаунта после сброса пуста', async () => {
    await specializationsRepo.save({ name: 'Мастерская' })
    await operationsRepo.enqueue(['op-1', 'insert', 'orders', '{"local_id":"x"}', 1000])
    await db.execute('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
      'last_synced_at:orders',
      '123',
    ])

    expect(await operationsRepo.countPending()).toBeGreaterThan(0)

    await syncService.fullReset()

    expect(await operationsRepo.countPending()).toBe(0)
    expect((await db.query('SELECT COUNT(*) AS total FROM specializations'))[0].total).toBe(0)
    expect(
      await db.query('SELECT * FROM meta WHERE key = ?', ['last_synced_at:orders'])
    ).toHaveLength(0)
  })
})
