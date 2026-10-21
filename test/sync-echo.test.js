// test/sync-echo.test.js
//
// Фаза 21: сервер не отдаёт «наши же» записи — и что с этим делать.
//
// Живой отчёт `43559f91` (21.10.2026, прод): локальная БД пересоздана в резервном
// режиме (нативный плагин не инициализировался), но выгрузка приходила пустой
// (`lastPullRecords: 0`), хотя на сервере у мастера 5 заказов, 6 клиентов, 68 работ.
// Причина: фильтр анти-эха `last_sync_id == X-Sync-ID` — все его записи были созданы
// этим же устройством (`last_sync_id = c20ee90b…` — ровно его `X-Sync-ID`), а серверные
// строки без метки (`product_stocks`) приезжали — отсюда «Нет локального товара для остатка».
//
// Лечение: если локальная БД пуста, а сервер отдал 0 — сменить `X-Sync-ID` (устройство
// становится «новым») и повторить полную выгрузку. Ровно один раз.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import api, { getSyncId } from 'src/services/api'
import syncService from 'src/services/syncService.js'
import storage from 'src/utils/storage.js'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

const OLD_ID = 'c20ee90b-a6fa-4b8e-bce6-608d916e5904'

let server

beforeEach(async () => {
  await setupTestDb()
  storage.setItem('auth_token', 'test-token')
  storage.setItem('sync_id', OLD_ID)
  // Одноразовый переход 21.25 уже выполнен — иначе первый же синк сменил бы id,
  // а эти тесты проверяют именно эвристику «БД пуста» (21.21/21.24).
  storage.setItem('sync_session_version', '2')
  storage.removeItem('sync_id_reissued_for_empty_db')

  server = createFakeServer()

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
    dbError: false,
    lastPullRecords: 0,
  }
  syncService._listeners = new Set()
})

afterEach(() => {
  storage.removeItem('auth_token')
  storage.removeItem('sync_id_reissued_for_empty_db')
  storage.removeItem('sync_session_version')
  vi.restoreAllMocks()
})

/** Сервер, который скрывает записи «этого устройства» (как настоящий анти-эхо). */
function mockEchoServer() {
  vi.spyOn(api, 'send').mockImplementation(payload => server.send(payload))
  vi.spyOn(api, 'fetchUpdates').mockImplementation(async ({ table, since = 0 }) => {
    if (getSyncId() === OLD_ID) return { table, count: 0, records: [] }

    return server.fetchUpdates({ table, since })
  })
}

describe('21.3 анти-эхо: пустая выдача при пустой локальной БД', () => {
  it('сменили X-Sync-ID и получили свои данные обратно', async () => {
    const seeded = server.seed('clients', {
      uuid_id: 'server-client-1',
      name: 'Сергей',
      phone: '999',
      specialization_id: null,
    })

    mockEchoServer()

    await syncService.sync()

    // Устройство представилось новым — сервер перестал скрывать записи.
    expect(getSyncId()).not.toBe(OLD_ID)
    expect(
      await db.queryOne('SELECT * FROM clients WHERE server_id = ?', [seeded.id])
    ).toMatchObject({ name: 'Сергей' })
  })

  it('когда данные приходят — идентификатор не трогаем', async () => {
    server.seed('clients', {
      uuid_id: 'server-client-2',
      name: 'Мария',
      phone: '111',
      specialization_id: null,
    })

    vi.spyOn(api, 'send').mockImplementation(payload => server.send(payload))
    vi.spyOn(api, 'fetchUpdates').mockImplementation(args => server.fetchUpdates(args))

    await syncService.sync()

    expect(getSyncId()).toBe(OLD_ID)
  })

  it('пустой аккаунт не зацикливаемся: смена — ровно один раз', async () => {
    mockEchoServer()

    await syncService.sync()
    const afterFirst = getSyncId()

    expect(afterFirst).not.toBe(OLD_ID)

    await syncService.sync()
    await syncService.sync()

    expect(getSyncId()).toBe(afterFirst)
  })

  // Живой случай Олега (отчёт `9311933e`): после пересоздания БД мастер заново выбрал
  // нишу, поэтому локальный профиль есть, а заказов/клиентов нет. Прошлая проверка
  // «пусто» опиралась на `specializations` и не срабатывала — данные так и не приехали.
  it('локальный профиль не мешает: ориентируемся на деловые данные', async () => {
    await db.execute(
      `INSERT INTO specializations (id, name) VALUES (?, ?)`,
      ['local-profile', 'Ремонт велосипедов']
    )

    const seeded = server.seed('clients', {
      uuid_id: 'server-client-3',
      name: 'Пётр',
      phone: '222',
      specialization_id: null,
    })

    mockEchoServer()

    await syncService.sync()

    expect(getSyncId()).not.toBe(OLD_ID)
    expect(
      await db.queryOne('SELECT * FROM clients WHERE server_id = ?', [seeded.id])
    ).toMatchObject({ name: 'Пётр' })
  })
})
