// test/sync-auth.test.js
//
// Задача 7.4: синк не работает без входа. Проверяем, что без токена он вообще не
// ходит в сеть (раньше это был бесконечный 401) и помечает состояние «требуется
// вход», что после входа накопленная очередь уезжает, а 401 приостанавливает синк
// без паузы-спама и не теряет операции.
//
// БД — настоящий sql.js, «сервер» — фейковый `SyncController` (test/helpers).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import api from 'src/services/api'
import syncService from 'src/services/syncService.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import storage from 'src/utils/storage.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

beforeEach(async () => {
  await setupTestDb()
  storage.removeItem('auth_token')

  // ⚠️ `vi.spyOn` без `mockImplementation` вызывает оригинальный метод — то есть
  // настоящий HTTP-запрос. Поэтому заглушки ставим сразу, а конкретные тесты их
  // переопределяют (фейковым сервером или ошибкой).
  vi.spyOn(api, 'send').mockResolvedValue({ synced: [], errors: [] })
  vi.spyOn(api, 'fetchUpdates').mockResolvedValue({ table: '', count: 0, records: [] })

  // syncService — singleton: сбрасываем состояние между тестами.
  syncService.syncing = false
  syncService.status = {
    online: true,
    syncing: false,
    lastError: null,
    consecutiveFailures: 0,
    nextRetryAt: 0,
    pendingCount: 0,
    requiresAuth: false,
  }
  syncService._listeners = new Set()
})

afterEach(() => {
  storage.removeItem('auth_token')
  vi.restoreAllMocks()
})

describe('7.4 синк требует вход', () => {
  it('без токена не ходит в сеть и помечает состояние «требуется вход»', async () => {
    await clientsRepo.save({ name: 'Иван' })

    await syncService.sync()

    expect(api.send).not.toHaveBeenCalled()
    expect(api.fetchUpdates).not.toHaveBeenCalled()
    expect(syncService.getStatus().requiresAuth).toBe(true)
    expect(await operationsRepo.countPending()).toBe(1)
  })

  it('refreshStatus отражает отсутствие входа и размер очереди', async () => {
    await clientsRepo.save({ name: 'Иван' })

    const status = await syncService.refreshStatus()

    expect(status.requiresAuth).toBe(true)
    expect(status.pendingCount).toBe(1)
  })

  it('после входа накопленная очередь уезжает', async () => {
    await clientsRepo.save({ name: 'Иван' })
    await syncService.sync()
    expect(await operationsRepo.countPending()).toBe(1)

    const server = createFakeServer()
    api.send.mockImplementation(payload => server.send(payload))
    api.fetchUpdates.mockImplementation(args => server.fetchUpdates(args))
    storage.setItem('auth_token', 'test-token')

    await syncService.sync()

    expect(api.send).toHaveBeenCalled()
    expect(await operationsRepo.countPending()).toBe(0)
    expect(syncService.getStatus().requiresAuth).toBe(false)
  })

  it('401 (токен отвергнут) приостанавливает синк без паузы и не теряет операцию', async () => {
    storage.setItem('auth_token', 'stale-token')
    await clientsRepo.save({ name: 'Иван' })

    api.send.mockRejectedValue({
      response: { status: 401 },
      message: 'Request failed with status code 401',
    })

    await syncService.sync()

    expect(syncService.getStatus().requiresAuth).toBe(true)
    expect(syncService.getStatus().nextRetryAt).toBe(0)
    expect(await operationsRepo.countPending()).toBe(1)
  })
})
