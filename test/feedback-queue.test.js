// test/feedback-queue.test.js
//
// Фаза 14, задача 14.4: отправка отчётов «Сообщить об ошибке».
//
// Проверяем офлайн-первое поведение (как у синка, 6.1): отчёт сначала ложится в
// локальную очередь, сеть/вход не нужны; при появлении возможности уезжает сам.
// Идемпотентность — на стороне сервера по `uuid_id`, поэтому повторный `flush()` не
// отправляет уже принятый отчёт второй раз. Отдельно — «неисправимые» ответы и лимит
// попыток: отчёт не должен теряться молча, он остаётся виден мастеру.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import { apiClient } from 'src/services/api.js'
import feedbackService, { MAX_FEEDBACK_ATTEMPTS } from 'src/services/feedbackService.js'
import feedbackRepo from 'src/repositories/feedbackRepo.js'
import storage from 'src/utils/storage.js'
import { clearErrors, recordError } from 'src/utils/errorLog.js'

const rowById = id => db.queryOne('SELECT * FROM feedback_reports WHERE id = ?', [id])

/** Управляем «сетью»: `feedbackService` смотрит на `navigator.onLine` (как syncService). */
function setOnline(value) {
  Object.defineProperty(globalThis.navigator, 'onLine', { value, configurable: true, writable: true })
}

const OK = { data: { ok: true, server_id: 42 } }

describe('14.4 отчёты об ошибке: офлайн-первая очередь', () => {
  beforeEach(async () => {
    await setupTestDb()
    storage.trySetItem('auth_token', 'test-token')
    setOnline(true)
    clearErrors()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setOnline(true)
    storage.removeItem('auth_token')
    clearErrors()
  })

  it('без сети отчёт остаётся в очереди и не теряется', async () => {
    setOnline(false)
    const post = vi.spyOn(apiClient, 'post')

    const result = await feedbackService.submit({ message: 'кнопка «сохранить» не работает' })

    expect(post).not.toHaveBeenCalled()
    expect(result).toMatchObject({ sent: 0, failed: 0, pending: 1 })
    expect(await rowById(result.id)).toMatchObject({ status: 'pending', attempts: 0 })
    expect(await feedbackService.pendingCount()).toBe(1)

    // Сеть появилась — отчёт уходит без действий мастера.
    setOnline(true)
    const ok = vi.spyOn(apiClient, 'post').mockResolvedValue(OK)

    await feedbackService.flush()

    expect(ok).toHaveBeenCalledTimes(1)
    expect(await rowById(result.id)).toMatchObject({ status: 'sent', server_id: 42 })
    expect(await feedbackService.pendingCount()).toBe(0)
  })

  it('успешная отправка: адрес, payload по контракту, повтор не дублирует', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(OK)

    const result = await feedbackService.submit({ message: 'ошибка при сохранении заказа' })

    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0]).toBe('/feedback')
    expect(post.mock.calls[0][1]).toMatchObject({
      uuid_id: result.id,
      kind: 'bug',
      message: 'ошибка при сохранении заказа',
    })
    expect(result.sent).toBe(1)

    // Повторный проход: очередь пуста, отчёт уже `sent` — дубля нет.
    await feedbackService.flush()

    expect(post).toHaveBeenCalledTimes(1)
    expect(await db.query('SELECT * FROM feedback_reports')).toHaveLength(1)
  })

  it('прикладывает хвост буфера ошибок и обходится без данных мастерской', async () => {
    recordError('error', ['[Sync] ошибка сервера'], { screen: '/orders/9' })
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(OK)

    await feedbackService.submit({ message: 'заказ не уезжает', screen: '/orders/9' })

    const payload = post.mock.calls[0][1]

    expect(payload.errors.at(-1)).toMatchObject({ level: 'error', message: '[Sync] ошибка сервера' })
    expect(payload.screen).toBe('/orders/9')
    expect(JSON.stringify(payload)).not.toContain('client_id')
  })

  it('401/422 — «неисправимые»: отчёт остаётся у мастера (failed) с текстом ошибки', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockRejectedValue({ response: { status: 401, data: { message: 'Unauthenticated.' } } })

    const result = await feedbackService.submit({ message: 'не пускает в приложение' })

    expect(result.failed).toBe(1)
    expect(post).toHaveBeenCalledTimes(1)
    expect(await rowById(result.id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error: 'Unauthenticated.',
    })
    expect(await feedbackService.pendingCount()).toBe(0)
  })

  it('сеть и 429 возвращают отчёт в очередь, попытки копятся', async () => {
    const post = vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Network Error'))

    const result = await feedbackService.submit({ message: 'нет связи, но ошибка есть' })

    expect(result.pending).toBe(1)
    expect(await rowById(result.id)).toMatchObject({
      status: 'pending',
      attempts: 1,
      last_error: 'Network Error',
    })

    post.mockRejectedValue({ response: { status: 429 } })
    await feedbackService.flush()

    expect(await rowById(result.id)).toMatchObject({ status: 'pending', attempts: 2 })
  })

  it('после лимита попыток отчёт «сдаётся»', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Network Error'))

    const result = await feedbackService.submit({ message: 'сдаётся после лимита' })

    await db.execute('UPDATE feedback_reports SET attempts = ? WHERE id = ?', [
      MAX_FEEDBACK_ATTEMPTS - 1,
      result.id,
    ])

    await feedbackService.flush()

    expect(await rowById(result.id)).toMatchObject({
      status: 'failed',
      attempts: MAX_FEEDBACK_ATTEMPTS,
    })
  })

  it('без токена входа отчёты ждут в очереди (в сеть не ходим)', async () => {
    storage.removeItem('auth_token')
    const post = vi.spyOn(apiClient, 'post')

    const result = await feedbackService.submit({ message: 'мастер ещё не вошёл' })

    expect(post).not.toHaveBeenCalled()
    expect(result.pending).toBe(1)
    expect(await rowById(result.id)).toMatchObject({ status: 'pending' })
  })

  it('полный сброс/смена аккаунта чистят очередь отчётов', async () => {
    setOnline(false)
    await feedbackService.submit({ message: 'отчёт первого аккаунта' })

    expect(await feedbackRepo.countPending()).toBe(1)

    await feedbackRepo.clearAll()

    expect(await feedbackService.pendingCount()).toBe(0)
    expect(await feedbackService.listAll()).toEqual([])
  })
})
