// test/sync-restored-copy.test.js
//
// Фаза 21, задача 21.25: восстановленная копия приложения — «то же устройство».
//
// Живой отчёт `bab73721` (21.10.2026, dev): на планшете в заказе нет услуги, которая
// есть на телефоне. Причина — не пустая БД, а **копия**: Android-бэкап / Smart Switch
// копирует WebView localStorage вместе с `sync_id`, поэтому у планшета тот же
// `X-Sync-ID`, что у телефона. Сервер по анти-эху (`last_sync_id == X-Sync-ID`)
// отдавал ему `orders` 0 из 2 и `order_service` 2 из 3 — планшет жил на снимке от 30.09.
// Проверка «локальная БД пуста» (21.21/21.24) такой случай не ловит: снимок непустой.
//
// Лечение: вход (`startNewSession()`) меняет `X-Sync-ID`, ставит маркер полной выдачи
// и сбрасывает курсоры; первый же синк читает сервер с нуля и без анти-эха.
//
// Здесь же — два дефекта выдачи, найденные при разборе:
//   • курсор таблицы брался как `max(Date.now(), maxRecord + 1)` — записи, созданные
//     между запросом и записью курсора, терялись навсегда;
//   • запись без локального родителя («Запись пропущена») молча терялась, потому что
//     курсор всё равно сдвигался.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import api, { getSyncId } from 'src/services/api'
import syncService from 'src/services/syncService.js'
import * as metaRepo from 'src/repositories/metaRepo.js'
import storage from 'src/utils/storage.js'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

/** `X-Sync-ID` телефона из отчёта `bab73721`. */
const OLD_ID = '1a362bd6-70c9-431c-9171-b46c0b4c05ed'
const FULL_PULL_KEY = 'sync_full_pull_pending'
const CLIENT_UPDATED_AT = '2026-10-21T12:20:22.000Z'
const LINE_UPDATED_AT = '2026-10-21T12:20:22.000Z'

let server
let originalOrderServiceRepo

beforeEach(async () => {
  await setupTestDb()
  storage.setItem('auth_token', 'test-token')
  storage.setItem('sync_id', OLD_ID)
  // По умолчанию считаем, что одноразовый переход 21.25 уже был: иначе каждый тест
  // начинался бы со смены id. Тест про переход убирает маркер сам.
  storage.setItem('sync_session_version', '2')
  storage.removeItem(FULL_PULL_KEY)
  storage.removeItem('sync_id_reissued_for_empty_db')

  server = createFakeServer()
  originalOrderServiceRepo = syncService.repos.order_service

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

  vi.spyOn(api, 'send').mockImplementation((payload) => server.send(payload))
})

afterEach(() => {
  syncService.repos.order_service = originalOrderServiceRepo
  storage.removeItem('auth_token')
  storage.removeItem(FULL_PULL_KEY)
  storage.removeItem('sync_session_version')
  storage.removeItem('sync_id_reissued_for_empty_db')
  vi.restoreAllMocks()
})

/**
 * Сервер с анти-эхом: записи, помеченные `OLD_ID`, устройству не отдаются.
 * `full: true` (после входа) отдаёт всё — как `full=1` в `SyncController`.
 */
function mockAntiEchoServer() {
  vi.spyOn(api, 'fetchUpdates').mockImplementation(async ({ table, since = 0, full = false }) => {
    if (!full) return { table, count: 0, records: [] }

    return server.fetchUpdates({ table, since })
  })
}

/** Локальная строка, из-за которой БД не считается пустой (снимок с другого устройства). */
async function seedLocalClient() {
  await db.execute(`INSERT INTO clients (id, name) VALUES (?, ?)`, [
    'local-client',
    'Старый клиент',
  ])
}

describe('21.25 восстановленная копия приложения', () => {
  it('непустая БД: вход меняет X-Sync-ID и забирает скрытые анти-эхом записи', async () => {
    await seedLocalClient()

    const seeded = server.seed('clients', {
      id: 42,
      uuid_id: 'server-client-bab73721',
      name: 'Сергей',
      phone: '999',
      last_sync_id: OLD_ID,
      updated_at: CLIENT_UPDATED_AT,
    })

    mockAntiEchoServer()

    // Обычный синк: сервер скрывает «свои» записи, но id не меняется — БД не пуста,
    // поэтому прежняя эвристика 21.21/21.24 молчит (ровно как на планшете).
    await syncService.sync()

    expect(getSyncId()).toBe(OLD_ID)
    expect(await db.queryOne('SELECT * FROM clients WHERE server_id = ?', [seeded.id])).toBeFalsy()
    expect(syncService.getStatus().lastPullRecords).toBe(0)

    // Вход: устройство представляется новым и просит полную выдачу без анти-эха.
    await syncService.startNewSession()
    await syncService.sync()

    expect(getSyncId()).not.toBe(OLD_ID)
    expect(
      await db.queryOne('SELECT * FROM clients WHERE server_id = ?', [seeded.id]),
    ).toMatchObject({ name: 'Сергей' })
    expect(syncService.getStatus().lastPullRecords).toBeGreaterThan(0)

    // Маркер снят — следующий синк снова инкрементальный.
    expect(storage.getItem(FULL_PULL_KEY)).toBeNull()

    // Курсор — по времени серверной записи, а не по часам устройства.
    expect(await metaRepo.getLastSyncedAt('clients')).toBe(Date.parse(CLIENT_UPDATED_AT) + 1)
  })

  it('курсор таблицы идёт за серверной записью, а не за Date.now()', async () => {
    server.seed('clients', {
      id: 7,
      uuid_id: 'server-client-cursor',
      name: 'Мария',
      phone: '',
      last_sync_id: 'other-device',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    vi.spyOn(api, 'fetchUpdates').mockImplementation((args) => server.fetchUpdates(args))

    await syncService.sync()

    // Прежняя формула `max(Date.now(), …)` дала бы «сейчас» и потеряла бы всё, что
    // сервер записал между запросом и записью курсора.
    expect(await metaRepo.getLastSyncedAt('clients')).toBe(
      Date.parse('2026-01-01T00:00:00.000Z') + 1,
    )
  })

  it('запись без родителя повторяется в том же проходе и не теряется', async () => {
    await seedLocalClient()

    server.seed('order_service', {
      id: null,
      uuid_id: 'line-late-parent',
      order_id: 777,
      service_id: 555,
      sale_price: 100,
      quantity: 1,
      last_sync_id: 'other-device',
      updated_at: LINE_UPDATED_AT,
    })

    // Первый раз родителя нет, во втором проходе он «приехал».
    const apply = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    syncService.repos.order_service = { applyServerRecord: apply }

    vi.spyOn(api, 'fetchUpdates').mockImplementation((args) => server.fetchUpdates(args))

    await syncService.sync()

    expect(apply).toHaveBeenCalledTimes(2)
    expect(await metaRepo.getLastSyncedAt('order_service')).toBe(Date.parse(LINE_UPDATED_AT) + 1)
  })

  it('если родитель так и не пришёл — курсор таблицы не двигается', async () => {
    await seedLocalClient()

    server.seed('order_service', {
      id: null,
      uuid_id: 'line-orphan',
      order_id: 888,
      service_id: 666,
      sale_price: 100,
      quantity: 1,
      last_sync_id: 'other-device',
      updated_at: LINE_UPDATED_AT,
    })

    const apply = vi.fn().mockResolvedValue(false)
    syncService.repos.order_service = { applyServerRecord: apply }

    vi.spyOn(api, 'fetchUpdates').mockImplementation((args) => server.fetchUpdates(args))

    await syncService.sync()

    // Основной проход + повтор в конце: оба раза родителя нет.
    expect(apply).toHaveBeenCalledTimes(2)

    // Курсор не сдвинулся — строка придёт снова, когда родитель появится.
    expect(await metaRepo.getLastSyncedAt('order_service')).toBe(0)
  })

  it('после обновления первый синк сам делает полную выгрузку — один раз', async () => {
    // Маркер версии сессии отсутствует: приложение обновилось, входа не будет
    // (ровно случай телефона Олега и планшета Евгения).
    storage.removeItem('sync_session_version')

    await seedLocalClient()

    const seeded = server.seed('clients', {
      id: 43,
      uuid_id: 'server-client-upgrade',
      name: 'Олег',
      phone: '',
      last_sync_id: OLD_ID,
      updated_at: CLIENT_UPDATED_AT,
    })

    mockAntiEchoServer()

    await syncService.sync()

    expect(getSyncId()).not.toBe(OLD_ID)
    expect(
      await db.queryOne('SELECT * FROM clients WHERE server_id = ?', [seeded.id]),
    ).toMatchObject({ name: 'Олег' })

    // Второй синк id не трогает: переход одноразовый.
    const afterUpgrade = getSyncId()

    await syncService.sync()

    expect(getSyncId()).toBe(afterUpgrade)
  })
})
