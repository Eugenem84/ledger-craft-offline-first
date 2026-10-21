// test/db-init.test.js
//
// Фаза 21: открытие локальной БД с восстановлением (`src/database/init.js`).
//
// Живой дефект 19.10.2026 (боевой контур, Олег, новый телефон): `init()` упал,
// `boot/db.js` проглотил ошибку (`console.error`), приложение стартовало и жило
// с `connection = null`. Каждая операция падала «База не открыта», синк не мог ни
// отправить очередь, ни скачать данные, а отчёт об ошибке не уходил. Причина
// падения нигде не сохранилась — разбирать было нечего.
//
// Здесь проверяем поведение замены: повторы, запись причины в состояние и буфер,
// автоматическое восстановление (новый файл БД) и то, что сбой миграций не
// «убивает» уже открытую БД.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDbState, resetDbStateForTests } from 'src/database/db.js'
import { initDatabase } from 'src/database/init.js'
import { getErrors, clearErrors } from 'src/utils/errorLog.js'

/** Адаптер-заглушка: считает вызовы, падает по сценарию. */
function createAdapter({ failures = 0, recoverable = false, recoverSucceeds = true } = {}) {
  let calls = 0
  let recovered = false

  return {
    name: 'test-adapter',
    get calls() {
      return calls
    },
    get recovered() {
      return recovered
    },
    async init() {
      calls += 1

      if (recovered) return

      if (calls <= failures) {
        throw new Error('Open: database ledgercraft not opened')
      }
    },
    async recover() {
      if (!recoverable) return false

      recovered = recoverSucceeds

      return recoverSucceeds
    },
  }
}

const log = { log: () => {}, warn: vi.fn(), error: vi.fn() }

beforeEach(() => {
  resetDbStateForTests()
  clearErrors()
  log.warn.mockClear()
  log.error.mockClear()
})

afterEach(() => {
  resetDbStateForTests()
  clearErrors()
})

describe('21.1 открытие локальной БД: повторы и восстановление', () => {
  it('первая неудача не приговор: вторая попытка открывает БД', async () => {
    const adapter = createAdapter({ failures: 1 })

    const result = await initDatabase(adapter, { retries: 3, retryDelayMs: 0, log })

    expect(result).toMatchObject({ ok: true, attempts: 2 })
    expect(adapter.calls).toBe(2)
    expect(getDbState().ready).toBe(true)
    expect(getDbState().error).toBeNull()
  })

  it('все попытки сорвались — причина записана и возвращена вызывающему', async () => {
    const adapter = createAdapter({ failures: 10 })

    const result = await initDatabase(adapter, { retries: 2, retryDelayMs: 0, log })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toContain('not opened')
    expect(getDbState()).toMatchObject({ ready: false })
    expect(log.error).toHaveBeenCalledWith(
      '[DB] Локальная БД не открыта:',
      expect.stringContaining('not opened')
    )
  })

  it('причина неудачи попадает в постоянный буфер (а не только в консоль)', async () => {
    const adapter = createAdapter({ failures: 1 })

    // Без подмены логгера: проверяем настоящий путь `logger.error` → `errorLog`.
    await initDatabase(adapter, { retries: 1, retryDelayMs: 0 })

    expect(getErrors().some(entry => entry.message.includes('Локальная БД не открыта'))).toBe(true)
  })

  it('аварийное восстановление: адаптер переключает файл, БД открывается', async () => {
    const adapter = createAdapter({ failures: 10, recoverable: true })

    const result = await initDatabase(adapter, { retries: 1, retryDelayMs: 0, log })

    expect(adapter.recovered).toBe(true)
    expect(result).toMatchObject({ ok: true, recovered: true })
    expect(getDbState().ready).toBe(true)
  })

  it('восстановление не удалось — остаёмся с понятной причиной, а не с «SQL-текстом»', async () => {
    const adapter = createAdapter({ failures: 10, recoverable: true, recoverSucceeds: false })

    const result = await initDatabase(adapter, { retries: 1, retryDelayMs: 0, log })

    expect(result.ok).toBe(false)
    expect(getDbState().ready).toBe(false)
  })

  it('сбой миграций не помечает открытую БД «мёртвой»', async () => {
    const adapter = createAdapter()

    const result = await initDatabase(adapter, {
      retries: 1,
      retryDelayMs: 0,
      log,
      migrate: async () => {
        throw new Error('no such table: migrations')
      },
    })

    expect(result.ok).toBe(true)
    expect(result.error?.message).toContain('migrations')
    expect(getDbState().ready).toBe(true)
  })
})
