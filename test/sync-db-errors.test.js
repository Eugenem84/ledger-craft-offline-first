// test/sync-db-errors.test.js
//
// Фаза 21: синк не «молчит» и не теряет приём из-за отправки.
//
// Живой лог 19.10.2026 (боевой контур, новый телефон) показал три вещи сразу:
//   • отправка падала → приём вообще не выполнялся («база с сервера не подгрузилась»);
//   • `lastError` не заполнялся → индикатор рапортовал «синхронизировано»;
//   • одна операция «клиент без имени» уходила на сервер снова и снова, потому что
//     `DATABASE_ERROR`/`23502` считался временной ошибкой.
// Здесь проверяем исправления: фазы независимы, ошибка БД видна, ошибка целостности
// данных «сдаётся» с первого раза и объясняет мастеру, что делать.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import api from 'src/services/api'
import syncService from 'src/services/syncService.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import storage from 'src/utils/storage.js'
import db from 'src/database/db.js'
import { clearErrors, getErrors } from 'src/utils/errorLog.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

let server

beforeEach(async () => {
  await setupTestDb()
  storage.setItem('auth_token', 'test-token')
  clearErrors()

  server = createFakeServer()
  vi.spyOn(api, 'send').mockImplementation(payload => server.send(payload))
  vi.spyOn(api, 'fetchUpdates').mockImplementation(args => server.fetchUpdates(args))

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
  vi.restoreAllMocks()
  clearErrors()
})

describe('21.2 приём с сервера не зависит от отправки', () => {
  it('упавшая отправка не мешает скачать данные', async () => {
    // На сервере есть клиент (например, заведён на другом устройстве).
    const seeded = server.seed('clients', {
      uuid_id: 'server-client-1',
      name: 'Сергей',
      phone: '999',
      specialization_id: null,
    })

    // Отправка падает так, как это было на живом контуре (ошибка внутри фазы).
    vi.spyOn(syncService, '_syncLocalToServer').mockRejectedValue(
      new Error('Ошибка при отправке операций')
    )

    await syncService.sync()

    // Главное: выгрузка всё равно выполнилась — клиент появился локально.
    const pulled = await db.queryOne('SELECT * FROM clients WHERE server_id = ?', [seeded.id])
    expect(pulled).toMatchObject({ name: 'Сергей' })
    expect(syncService.getStatus().lastPullRecords).toBeGreaterThan(0)

    // И ошибка не потерялась: индикатор больше не врёт про «всё синхронизировано».
    expect(syncService.getStatus().lastError).toContain('Ошибка при отправке операций')
    expect(syncService.getStatus().syncing).toBe(false)
  })

  it('ошибка «база не открыта» переводит индикатор в отдельное состояние', async () => {
    syncService._registerSyncError(
      Object.assign(new Error('[SQLITE] База не открыта: init() не вызван'), {
        code: 'DB_NOT_READY',
      })
    )

    expect(syncService.getStatus()).toMatchObject({ dbError: true })
    expect(syncService.getStatus().lastError).toContain('Локальная база данных не открылась')
    expect(getErrors().some(entry => entry.message.includes('Локальная БД не открыта'))).toBe(true)
  })
})

describe('21.3 «ядовитая» операция не крутится в очереди', () => {
  it('NOT NULL от сервера — сразу «сдалась», с понятной причиной', async () => {
    // Ровно то, что пришло с боевого сервера: пустое имя клиента стало null.
    server.configure({
      errorFor: () => ({
        error: 'DATABASE_ERROR',
        details: {
          message: 'SQLSTATE[23502]: Not null violation: 7 ERROR: null value in column "name"',
        },
      }),
    })

    const id = await clientsRepo.save({ name: 'Иван', phone: '123' })
    expect(await operationsRepo.countPending()).toBe(1)

    await syncService.sync()

    const op = await db.queryOne('SELECT * FROM operations WHERE "table" = ?', ['clients'])
    expect(op).toMatchObject({ status: 'failed', attempts: 1 })
    expect(op.last_error).toContain('исправьте данные')

    // Повторный проход не отправляет её снова: сервер её больше не увидит.
    const before = server.received.length
    await syncService.sync()
    expect(server.received.length).toBe(before)

    // Клиент остался локально — мастер может исправить данные и повторить.
    expect(await db.queryOne('SELECT * FROM clients WHERE id = ?', [id])).toMatchObject({
      name: 'Иван',
    })
  })
})
