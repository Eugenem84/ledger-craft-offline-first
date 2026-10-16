// test/operations-retry.test.js
//
// Фаза 12: очередь перестаёт «висеть вечно». Раньше любая ошибка сервера
// возвращала операцию в `pending` без ограничений — очередь тихо копила дубли,
// а неисправимая операция (чужой/удалённый заказ, кривой payload) висела навсегда
// (дефект живого прогона 11.6).
//
// Теперь: у операции есть `attempts`, неисправимые ошибки «сдаются» сразу,
// обычные — до лимита попыток, после чего статус `failed` («сдалась»).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import api from 'src/services/api'
import syncService from 'src/services/syncService.js'
import operationsRepo from 'src/repositories/operationsRepo.js'

const OP_ID = 'op-1'

/** Ставит операцию в очередь и возвращает её строку (payload — строка, как из БД). */
async function enqueueOp() {
  await operationsRepo.enqueue([OP_ID, 'update', 'orders', JSON.stringify({ id: 32 }), 1000])
  return db.queryOne('SELECT * FROM operations WHERE id = ?', [OP_ID])
}

const opRow = () => db.queryOne('SELECT status, attempts FROM operations WHERE id = ?', [OP_ID])

function serverError(code, details = null) {
  return vi
    .spyOn(api, 'send')
    .mockResolvedValue({ synced: [], errors: [{ local_id: OP_ID, error: code, details }] })
}

describe('12 (11.6) попытки операции: неисправимое «сдаётся», обычное — до лимита', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('неисправимая ошибка (RECORD_NOT_FOUND) сразу переводит операцию в failed', async () => {
    const op = await enqueueOp()
    serverError('RECORD_NOT_FOUND')

    await syncService._sendOperations([op])

    expect(await opRow()).toMatchObject({ status: 'failed', attempts: 1 })
    expect(await operationsRepo.countFailed()).toBe(1)
    expect(await operationsRepo.countPending()).toBe(0)
  })

  it('обычная ошибка копит попытки и возвращает операцию в pending', async () => {
    const op = await enqueueOp()
    serverError('DATABASE_ERROR', { message: 'boom' })

    await syncService._sendOperations([op])

    expect(await opRow()).toMatchObject({ status: 'pending', attempts: 1 })
    expect(await operationsRepo.countPending()).toBe(1)
  })

  it('исчерпав лимит попыток, операция «сдаётся»', async () => {
    await enqueueOp()
    // Лимит в syncService — 5 попыток; ставим 4, значит текущая — последняя.
    await db.execute('UPDATE operations SET attempts = ? WHERE id = ?', [4, OP_ID])

    const op = await db.queryOne('SELECT * FROM operations WHERE id = ?', [OP_ID])
    serverError('DATABASE_ERROR', { message: 'boom' })

    await syncService._sendOperations([op])

    expect(await opRow()).toMatchObject({ status: 'failed', attempts: 5 })
    expect(await operationsRepo.countFailed()).toBe(1)
  })

  it('структурная ошибка сервера тоже неисправима', async () => {
    const op = await enqueueOp()
    serverError('Unsupported operation type: magic')

    await syncService._sendOperations([op])

    expect(await opRow()).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('discardFailedOperations убирает «сдавшиеся» и обновляет состояние', async () => {
    await enqueueOp()
    await operationsRepo.registerFailure(OP_ID, 3, true)

    expect(await operationsRepo.countFailed()).toBe(1)

    const removed = await syncService.discardFailedOperations()

    expect(removed).toBe(1)
    expect(await operationsRepo.countFailed()).toBe(0)
    expect(await db.query('SELECT * FROM operations')).toHaveLength(0)
    expect(syncService.getStatus().failedCount).toBe(0)
  })
})

// Живой отчёт мастера 16.10.2026 (**боевой** контур, задача 14.33): «На вкладке заказ, в
// правом верхнем углу горит красным треугольник. И ничего не выдаёт при нажатии на него».
//
// «Сдавшиеся» операции синк не отправляет вовсе, а убрать их мастер мог только через
// «Режим разработчика» — то есть нажимать было нечего и значок выглядел «мёртвым».
// Теперь у мастера есть «Повторить отправку»: операция возвращается в очередь (сервер
// идемпотентен по `uuid_id`, дублей не будет) и счётчик попыток начинается заново.
describe('14.33 «Повторить отправку»: «сдавшиеся» возвращаются в очередь', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requeueFailed возвращает операцию в pending и обнуляет счётчик попыток', async () => {
    const op = await enqueueOp()
    serverError('RECORD_NOT_FOUND')
    await syncService._sendOperations([op])

    expect(await opRow()).toMatchObject({ status: 'failed', attempts: 1 })

    const count = await operationsRepo.requeueFailed()

    expect(count).toBe(1)
    expect(await opRow()).toMatchObject({ status: 'pending', attempts: 0 })
    expect(await operationsRepo.countFailed()).toBe(0)
    expect(await operationsRepo.countPending()).toBe(1)
  })

  it('когда «сдавшихся» нет, повтор ничего не делает и синк не запускает', async () => {
    const syncSpy = vi.spyOn(syncService, 'sync').mockResolvedValue()

    const count = await syncService.retryFailedOperations()

    expect(count).toBe(0)
    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('повтор отправки возвращает операцию в очередь и дожимает синк', async () => {
    const op = await enqueueOp()
    serverError('RECORD_NOT_FOUND')
    await syncService._sendOperations([op])

    const syncSpy = vi.spyOn(syncService, 'sync').mockResolvedValue()
    const count = await syncService.retryFailedOperations()

    expect(count).toBe(1)
    expect(syncSpy).toHaveBeenCalledWith({ force: true })
    expect(await operationsRepo.countPending()).toBe(1)
    expect(await operationsRepo.countFailed()).toBe(0)
    expect(syncService.getStatus().pendingCount).toBe(1)
  })

  it('диалог значка получает «сдавшиеся» вместе с причиной отказа', async () => {
    await enqueueOp()
    await operationsRepo.registerFailure(OP_ID, 3, true, 'DATABASE_ERROR: bad row')

    const stuck = await syncService.listStuckOperations()

    expect(stuck.failed).toHaveLength(1)
    expect(stuck.failed[0].last_error).toContain('DATABASE_ERROR')
    expect(stuck.blocked).toEqual([])
  })
})
