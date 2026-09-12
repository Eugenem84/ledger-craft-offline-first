// test/share-link.test.js
//
// Задача 9.4: публичная ссылка на отчёт. Ссылку выдаёт сервер и только владельцу
// заказа, поэтому клиент обязан: не ходить в сеть без `server_id` (заказ ещё не
// синхронизирован) и объяснять пользователю причину отказа. Здесь проверяем обе
// половины: стор (адрес запроса, код `ORDER_NOT_SYNCED`, проброс ошибки сервера)
// и чистую функцию причин `shareLinkErrorView`.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { setupTestDb } from './helpers/testDb.js'
import { apiClient } from 'src/services/api.js'
import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'
import { shareLinkErrorView, ORDER_NOT_SYNCED } from 'src/utils/shareLinkError.js'

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('9.4 share-ссылка: стор заказа', () => {
  it('шлёт POST по server_id и возвращает выданный сервером url', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { url: 'https://server/order-report/7?token=abc' } })

    const draft = useOrderDraftStore()
    draft.order = { id: 'local-1', server_id: 7 }

    await expect(draft.generateShareLink()).resolves.toBe('https://server/order-report/7?token=abc')
    expect(post).toHaveBeenCalledWith('/order-report/7/share-link')
  })

  it('без server_id в сеть не ходит и помечает причину ORDER_NOT_SYNCED', async () => {
    const post = vi.spyOn(apiClient, 'post')

    const draft = useOrderDraftStore()
    draft.order = { id: 'local-1', server_id: null }

    await expect(draft.generateShareLink()).rejects.toMatchObject({ code: ORDER_NOT_SYNCED })
    expect(post).not.toHaveBeenCalled()
  })

  it('ошибку сервера пробрасывает наружу (её объясняет shareLinkErrorView)', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { status: 404 } })

    const draft = useOrderDraftStore()
    draft.order = { id: 'local-1', server_id: 7 }

    await expect(draft.generateShareLink()).rejects.toMatchObject({
      response: { status: 404 },
    })
  })
})

describe('9.4 share-ссылка: причины отказа', () => {
  it('не синхронизирован — просьба сначала синхронизировать', () => {
    const error = Object.assign(new Error('x'), { code: ORDER_NOT_SYNCED })

    expect(shareLinkErrorView(error)).toEqual({
      message: 'Сначала нужно синхронизировать ордер',
      level: 'warning',
    })
  })

  it('нет ответа сети — «нужен интернет», а не ошибка сервера', () => {
    expect(shareLinkErrorView(new Error('Network Error'))).toEqual({
      message: 'Нужен интернет, чтобы создать ссылку',
      level: 'warning',
    })
  })

  it('401 — ссылку создаёт сервер, нужен вход', () => {
    expect(shareLinkErrorView({ response: { status: 401 } })).toEqual({
      message: 'Ссылку создаёт сервер: войдите в приложение',
      level: 'warning',
    })
  })

  it('404 — ордер не найден на сервере', () => {
    expect(shareLinkErrorView({ response: { status: 404 } })).toEqual({
      message: 'Ордер не найден на сервере',
      level: 'warning',
    })
  })

  it('неизвестная ошибка — отрицательное уведомление', () => {
    expect(shareLinkErrorView({ response: { status: 500 } })).toEqual({
      message: 'Не удалось создать ссылку',
      level: 'negative',
    })
  })
})
