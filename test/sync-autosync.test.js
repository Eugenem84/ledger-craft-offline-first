// test/sync-autosync.test.js
//
// Фаза 6: неблокирующий запуск синка (6.1) и автоповтор при выходе из офлайна (6.3).
//
// Проверяем поведение `syncService.startAutoSync()/stopAutoSync()/_handleOnline()`
// на настоящем sql.js и фейковом сервере (test/helpers). Заглушены только транспорт
// и хранилище — как в test/sync.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import api from 'src/services/api'
import syncService from 'src/services/syncService.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import storage from 'src/utils/storage.js'
import { setupTestDb } from './helpers/testDb.js'
import { createFakeServer } from './helpers/fakeServer.js'

/** Даёт фоновому проходу (setTimeout + цепочка промисов) выполниться. */
const flushBackground = () => new Promise(resolve => setTimeout(resolve, 20))

let server
let originalIsOnline

beforeEach(async () => {
  await setupTestDb()

  // Синк требует вход (задача 7.4): без токена он не пойдёт в сеть.
  storage.setItem('auth_token', 'test-token')

  server = createFakeServer()
  vi.spyOn(api, 'send').mockImplementation(payload => server.send(payload))
  vi.spyOn(api, 'fetchUpdates').mockImplementation(args => server.fetchUpdates(args))

  // syncService — singleton: сбрасываем состояние и автозапуск между тестами.
  originalIsOnline = syncService._isOnline
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
  syncService.stopAutoSync()
})

afterEach(() => {
  syncService.stopAutoSync()
  syncService._isOnline = originalIsOnline
  storage.removeItem('auth_token')
  vi.restoreAllMocks()
})

describe('6.1 неблокирующий синк', () => {
  it('startAutoSync возвращается сразу — вызывающий не ждёт сети', async () => {
    await clientsRepo.save({ name: 'Иван' })

    syncService.startAutoSync({ intervalMs: 0 })

    // Ключевое: вызов вернулся синхронно, сетевого запроса ещё не было.
    expect(api.send).not.toHaveBeenCalled()
    expect(syncService._autoSyncStarted).toBe(true)

    await flushBackground()

    // Фоном операция всё-таки уехала.
    expect(api.send).toHaveBeenCalledTimes(1)
    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('повторный вызов идемпотентен: один автозапуск, один таймер', async () => {
    await clientsRepo.save({ name: 'Иван' })

    syncService.startAutoSync({ intervalMs: 60000 })
    syncService.startAutoSync({ intervalMs: 60000 })

    await flushBackground()

    expect(api.send).toHaveBeenCalledTimes(1)

    // За период одного интервала повторного прохода не появляется.
    expect(syncService._autoSyncTimer).not.toBeNull()
  })

  it('stopAutoSync отменяет запланированный проход', async () => {
    await clientsRepo.save({ name: 'Иван' })

    syncService.startAutoSync({ intervalMs: 60000 })
    syncService.stopAutoSync()

    await flushBackground()

    expect(api.send).not.toHaveBeenCalled()
    expect(syncService._autoSyncStarted).toBe(false)
    expect(syncService._autoSyncTimer).toBeNull()
  })

  it('периодический таймер повторяет синк', async () => {
    await clientsRepo.save({ name: 'Иван' })

    // Считаем именно запуски sync(): сеть вызывается только когда есть очередь,
    // а таймер должен «будить» синхронизацию и при пустой очереди.
    const syncSpy = vi.spyOn(syncService, 'sync')

    // Небольшой интервал: проверяем сам факт повторов, а не значение по умолчанию.
    syncService.startAutoSync({ intervalMs: 10 })

    await flushBackground()
    const afterFirstRun = syncSpy.mock.calls.length

    await flushBackground()
    expect(syncSpy.mock.calls.length).toBeGreaterThan(afterFirstRun)
  })
})

describe('6.3 автоповтор при выходе из офлайна', () => {
  it('реальный офлайн копит операции, online — сразу дожимает без таймера', async () => {
    await clientsRepo.save({ name: 'Иван' })

    // Офлайн по-настоящему: сервер не отвечает ни на отправку, ни на выдачу.
    // (Флага `navigator.onLine` для этого мало: он бывает залипшим в обе стороны —
    // дефект 14.11, поэтому синк всегда пробует сеть.)
    server.configure({ failSendWith: new Error('network down'), failFetchWith: new Error('network down') })
    syncService._handleOffline()
    await syncService.sync()

    expect(await operationsRepo.countPending()).toBe(1)
    expect(syncService.getStatus().online).toBe(false)

    // Попытка была и в офлайне (флаг `navigator.onLine` — только подсказка),
    // поэтому считаем отправки относительно, а не с нуля.
    const sendsBefore = api.send.mock.calls.length

    // Автозапуск включён — событие online немедленно повторяет синк.
    server.configure({ failFetchWith: null })
    syncService._autoSyncStarted = true
    syncService._isOnline = () => true
    await syncService._handleOnline()

    expect(api.send.mock.calls.length).toBe(sendsBefore + 1)
    expect(await operationsRepo.countPending()).toBe(0)
    expect(syncService.getStatus().online).toBe(true)
  })

  it('возврат в приложение перепроверяет сеть и дожимает очередь (14.11)', async () => {
    await clientsRepo.save({ name: 'Иван' })

    // Флаг WebView залип в «офлайн»: без перепроверки на resume приложение
    // осталось бы без синка до перезапуска (дефект живого прогона на Android).
    syncService._isOnline = () => false
    syncService._setStatus({ online: false })

    await syncService.handleResume()

    expect(api.send).toHaveBeenCalledTimes(1)
    expect(await operationsRepo.countPending()).toBe(0)
    expect(syncService.getStatus().online).toBe(true)
  })

  it('online снимает паузу после сбоя', async () => {
    syncService.status.nextRetryAt = Date.now() + 60000

    await syncService._handleOnline()

    expect(syncService.getStatus().nextRetryAt).toBe(0)
  })

  it('без автозапуска online только обновляет состояние', async () => {
    await clientsRepo.save({ name: 'Иван' })
    syncService._autoSyncStarted = false

    await syncService._handleOnline()

    expect(api.send).not.toHaveBeenCalled()
    expect(await operationsRepo.countPending()).toBe(1)
  })
})

describe('6.2 состояние для индикатора', () => {
  it('refreshStatus перечитывает очередь и рассылает подписчикам', async () => {
    await clientsRepo.save({ name: 'Иван' })

    const seen = []
    const unsubscribe = syncService.subscribe(status => seen.push(status.pendingCount))

    const status = await syncService.refreshStatus()

    expect(status.pendingCount).toBe(1)
    expect(seen).toContain(1)

    unsubscribe()
    await syncService.refreshStatus()
    expect(seen).toHaveLength(1)
  })
})
