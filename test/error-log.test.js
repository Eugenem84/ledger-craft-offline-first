// test/error-log.test.js
//
// Фаза 14, задача 14.1: постоянный буфер ошибок.
//
// В отличие от кольцевого буфера `logger` (12.5) он пишется всегда и переживает
// перезапуск — именно его хвост прикладывается к отчёту «Сообщить об ошибке».
// Проверяем: лимиты и обрезку, дедупликацию повторов, персистентность, перехватчики
// (`error`/`unhandledrejection`/Vue `errorHandler`) и их идемпотентность.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import storage from 'src/utils/storage.js'
import {
  ERROR_LOG_KEY,
  ERROR_LOG_LIMIT,
  ERROR_LOG_MESSAGE_LIMIT,
  clearErrors,
  errorLogCount,
  formatErrorMessage,
  getErrors,
  installErrorHandlers,
  recordError,
  resetErrorHandlersForTests,
} from 'src/utils/errorLog.js'

/** Временная замена `addEventListener` — перехватчики долго живут, а тесты должны быть изолированы. */
function captureGlobalHandlers() {
  const handlers = {}
  const original = globalThis.addEventListener

  globalThis.addEventListener = (type, callback) => {
    handlers[type] = callback
  }

  return {
    handlers,
    restore: () => {
      globalThis.addEventListener = original
    },
  }
}

describe('14.1 постоянный буфер ошибок', () => {
  beforeEach(() => {
    clearErrors()
    resetErrorHandlersForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearErrors()
    resetErrorHandlersForTests()
  })

  it('formatErrorMessage склеивает аргументы и обрезает длинное', () => {
    expect(formatErrorMessage(['а', 'б'])).toBe('а б')
    expect(formatErrorMessage([{ a: 1 }])).toBe('{"a":1}')
    expect(formatErrorMessage([new Error('бум')])).toBe('бум')
    expect(formatErrorMessage(['x'.repeat(ERROR_LOG_MESSAGE_LIMIT + 50)])).toHaveLength(
      ERROR_LOG_MESSAGE_LIMIT
    )
    expect(formatErrorMessage([])).toBe('')
  })

  it('записывает уровни, экран и отбрасывает точный дубль подряд', () => {
    recordError('warn', ['мало места'], { screen: '/store' })
    recordError('error', ['упало'])

    expect(getErrors()).toMatchObject([
      { level: 'warn', message: 'мало места', screen: '/store' },
      { level: 'error', message: 'упало' },
    ])

    // Тот же текст в том же окне — не размножаем (иначе цикл забьёт буфер).
    expect(recordError('error', ['упало'])).toBeNull()
    expect(errorLogCount()).toBe(2)

    // Неизвестный уровень приводим к `error`, а не теряем запись.
    recordError('log', ['нечто'])
    expect(getErrors().at(-1).level).toBe('error')
  })

  it('держится в пределах кольца и переживает «перезапуск» (хранилище)', () => {
    for (let index = 0; index < ERROR_LOG_LIMIT + 20; index += 1) {
      recordError('error', [`ошибка ${index}`])
    }

    expect(errorLogCount()).toBe(ERROR_LOG_LIMIT)
    expect(getErrors(1)[0].message).toBe(`ошибка ${ERROR_LOG_LIMIT + 19}`)

    const stored = JSON.parse(storage.getItem(ERROR_LOG_KEY))
    expect(stored).toHaveLength(ERROR_LOG_LIMIT)
    expect(stored.at(-1).message).toBe(`ошибка ${ERROR_LOG_LIMIT + 19}`)

    expect(getErrors(5)).toHaveLength(5)

    clearErrors()
    expect(errorLogCount()).toBe(0)
    expect(storage.getItem(ERROR_LOG_KEY)).toBeNull()
  })

  it('installErrorHandlers идемпотентен и перехватывает браузерные ошибки', () => {
    const capture = captureGlobalHandlers()

    try {
      expect(installErrorHandlers({ getScreen: () => '/orders/7' })).toBe(true)
      // Повторный вызов (boot в hot-reload) не должен навешивать обработчики дважды.
      expect(installErrorHandlers({ getScreen: () => '/orders/7' })).toBe(false)

      capture.handlers.error({ message: 'window.onerror' })
      capture.handlers.unhandledrejection({ reason: new Error('упал промис') })

      expect(getErrors()).toMatchObject([
        { level: 'error', message: 'window.onerror', screen: '/orders/7' },
        { level: 'error', message: 'упал промис', screen: '/orders/7' },
      ])
    } finally {
      capture.restore()
    }
  })

  it('перехватывает ошибки Vue и зовёт предыдущий обработчик', () => {
    const previous = vi.fn()
    const app = { config: { errorHandler: previous } }

    installErrorHandlers({ app, getScreen: () => '/catalog' })
    app.config.errorHandler(new Error('vue упал'), null, 'render')

    expect(getErrors().at(-1)).toMatchObject({ message: 'vue упал render', screen: '/catalog' })
    expect(previous).toHaveBeenCalledTimes(1)
  })
})
