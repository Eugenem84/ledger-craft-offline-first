// test/feedback-outbox.test.js
//
// Фаза 21: отчёт «Сообщить об ошибке» уходит и тогда, когда локальная БД не открыта.
//
// Живой дефект 19.10.2026: на новом телефоне SQLite не открылся, и `feedbackRepo.enqueue()`
// упал с `[SQLITE] База не открыта`. Мастер увидел SQL-текст вместо «отчёт отправлен» —
// сообщить о поломке было нечем. Теперь отчёт в этом случае ждёт отправки в
// `localStorage` (`utils/feedbackOutbox.js`), а `feedbackService` досылает обе очереди.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from 'src/services/api.js'
import feedbackService from 'src/services/feedbackService.js'
import { markDbFailed, resetDbStateForTests, setAdapter } from 'src/database/db.js'
import feedbackOutbox from 'src/utils/feedbackOutbox.js'
import storage from 'src/utils/storage.js'
import { setupTestDb } from './helpers/testDb.js'

/** Адаптер «БД не открыта»: любой запрос падает тем же текстом, что на устройстве. */
function createBrokenAdapter() {
  const fail = () => {
    const error = new Error('[SQLITE] База не открыта: init() не вызван или соединение закрыто')
    error.code = 'DB_NOT_READY'
    throw error
  }

  return {
    name: 'broken',
    init: async () => fail(),
    execute: fail,
    query: fail,
    queryOne: fail,
    transaction: fail,
    getSchemaVersion: fail,
    setSchemaVersion: fail,
  }
}

const setOnline = value => {
  Object.defineProperty(globalThis.navigator, 'onLine', { value, configurable: true, writable: true })
}

beforeEach(() => {
  feedbackOutbox.clear()
  storage.trySetItem('auth_token', 'test-token')
  setOnline(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  resetDbStateForTests()
  feedbackOutbox.clear()
  storage.removeItem('auth_token')
  setOnline(true)
})

describe('21.4 отчёт без локальной БД', () => {
  it('БД не открыта — отчёт всё равно уходит на сервер', async () => {
    setAdapter(createBrokenAdapter())
    markDbFailed(new Error('[SQLITE] База не открыта'))
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { server_id: 7 } })

    const result = await feedbackService.submit({ message: 'база не открывается после установки' })

    expect(post).toHaveBeenCalledTimes(1)
    expect(result.sent).toBe(1)
    // Отчёт не потерялся и не завис в резервной очереди.
    expect(feedbackOutbox.list()).toHaveLength(0)
    expect(await feedbackService.pendingCount()).toBe(0)
  })

  it('нет сети — отчёт ждёт в резервной очереди и уходит сам', async () => {
    setAdapter(createBrokenAdapter())
    markDbFailed(new Error('[SQLITE] База не открыта'))
    setOnline(false)
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Network Error'))

    const result = await feedbackService.submit({ message: 'нет сети и нет базы' })

    expect(result.pending).toBe(1)
    expect(feedbackOutbox.count()).toBe(1)
    expect(await feedbackService.pendingCount()).toBe(1)

    // Сеть вернулась — отчёт уходит без действий мастера.
    setOnline(true)
    post.mockResolvedValue({ data: { server_id: 8 } })

    const flushed = await feedbackService.flush()

    expect(flushed.sent).toBe(1)
    expect(feedbackOutbox.list()).toHaveLength(0)
  })

  it('после починки БД очередь отчётов снова живёт в SQLite', async () => {
    await setupTestDb()
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })

    const result = await feedbackService.submit({ message: 'обычный отчёт' })

    expect(post).toHaveBeenCalledTimes(1)
    expect(result.sent).toBe(1)
    expect(feedbackOutbox.list()).toHaveLength(0)
  })
})
