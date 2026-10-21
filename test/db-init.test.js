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
import { initDatabase, openDatabase, resetRecoveryForTests } from 'src/database/init.js'
import { getErrors, clearErrors } from 'src/utils/errorLog.js'

/** Адаптер-заглушка: считает вызовы, падает по сценарию. */
function createAdapter({
  name = 'test-adapter',
  failures = 0,
  recoverable = false,
  recoverSucceeds = true,
  canRecover = true,
} = {}) {
  let calls = 0
  let recovered = false
  let recoverCalls = 0

  return {
    name,
    get calls() {
      return calls
    },
    get recovered() {
      return recovered
    },
    get recoverCalls() {
      return recoverCalls
    },
    canRecover: () => canRecover,
    async init() {
      calls += 1

      if (recovered) return

      if (calls <= failures) {
        throw new Error('Open: database ledgercraft not opened')
      }
    },
    async recover() {
      recoverCalls += 1

      if (!recoverable) return false

      recovered = recoverSucceeds

      return recoverSucceeds
    },
  }
}

/** Адаптер, который вообще не может открыться (как нативный плагин на Android 16). */
function createBrokenAdapter(name = 'broken-native') {
  return {
    name,
    canRecover: () => false,
    async init() {
      throw new Error('CapacitorSQLitePlugin: null')
    },
  }
}

const log = { log: () => {}, warn: vi.fn(), error: vi.fn() }

beforeEach(() => {
  resetDbStateForTests()
  resetRecoveryForTests()
  clearErrors()
  log.warn.mockClear()
  log.error.mockClear()
})

afterEach(() => {
  resetDbStateForTests()
  resetRecoveryForTests()
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

  // Живой отчёт 21.10.2026 (TECNO, Android 16): нативный плагин не инициализировался,
  // каждый вызов отвечал `CapacitorSQLitePlugin: null`. В журнале — новые файлы БД
  // пачками (`ledgercraft24 … ledgercraft28`), потому что ротация шла на любую ошибку.
  it('провал самого плагина не ротирует файл (это не лечится новым именем)', async () => {
    const adapter = createBrokenAdapter()

    const result = await initDatabase(adapter, { retries: 1, retryDelayMs: 0, log })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toContain('CapacitorSQLitePlugin')
    // Файл БД не трогали: причина не в файле.
    expect(getDbState()).toMatchObject({ ready: false, adapter: 'broken-native' })
  })

  it('ротация — не больше одного раза за запуск (иначе плодятся файлы)', async () => {
    const adapter = createAdapter({ failures: 100, recoverable: true, recoverSucceeds: false })

    await initDatabase(adapter, { retries: 1, retryDelayMs: 0, log })
    await initDatabase(adapter, { retries: 1, retryDelayMs: 0, log })
    await initDatabase(adapter, { retries: 1, retryDelayMs: 0, log })

    expect(adapter.recoverCalls).toBe(1)
  })
})

describe('21.2 резервный адаптер: приложение работает, даже если плагин мёртв', () => {
  it('нативный не поднялся — включается sql.js, данные потом приедут с сервера', async () => {
    const native = createBrokenAdapter('sqlite-capacitor')
    const web = createAdapter({ name: 'sqljs-web' })

    const { adapter, result, fallback } = await openDatabase([native, web], {
      retries: 1,
      retryDelayMs: 0,
      log,
    })

    expect(fallback).toBe(true)
    expect(adapter).toBe(web)
    expect(result.ok).toBe(true)
    expect(getDbState()).toMatchObject({ ready: true, adapter: 'sqljs-web' })
  })

  it('нативный работает — резервный не трогаем', async () => {
    const native = createAdapter({ name: 'sqlite-capacitor' })
    const web = createAdapter({ name: 'sqljs-web' })

    const { adapter, fallback } = await openDatabase([native, web], {
      retries: 1,
      retryDelayMs: 0,
      log,
    })

    expect(fallback).toBe(false)
    expect(adapter).toBe(native)
    expect(web.calls).toBe(0)
    expect(getDbState().adapter).toBe('sqlite-capacitor')
  })

  it('оба сломались — состояние «БД не открыта» с адаптером в причине', async () => {
    const { adapter, result } = await openDatabase(
      [createBrokenAdapter('sqlite-capacitor'), createBrokenAdapter('sqljs-web')],
      { retries: 1, retryDelayMs: 0, log }
    )

    expect(adapter).toBeNull()
    expect(result.ok).toBe(false)
    expect(getDbState()).toMatchObject({ ready: false, adapter: 'sqljs-web' })
  })
})
