// test/phase12-dev.test.js
//
// Фаза 12, задачи 12.4/12.5: разрушительные действия убраны из пользовательских
// настроек, а отладочный инструментарий переехал в «Режим разработчика», который
// существует только в dev-сборке.
//
// Проверяем: чистые форматтеры панели (`src/utils/devInfo.js`), кольцевой буфер
// `logger`, чтение очереди операций и — структурно — что dev-панель подключена
// динамическим импортом под `import.meta.env.DEV`, а в prod-бандл её код не входит.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

import { setupTestDb } from './helpers/testDb.js'
import operationsRepo from 'src/repositories/operationsRepo.js'
import { logger, getLogBuffer, clearLogBuffer, LOG_BUFFER_LIMIT } from 'src/utils/logger.js'
import {
  describeOperation,
  describeSchemaVersion,
  describeSyncStatus,
  formatLogEntry,
  summarizePayload,
  truncate,
} from 'src/utils/devInfo.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('12.5 Форматтеры отладочной панели', () => {
  it('truncate обрезает длинный текст и не трогает короткий', () => {
    expect(truncate('abc', 10)).toBe('abc')
    expect(truncate('abcdefghij', 5)).toBe('abcd…')
    expect(truncate(null)).toBe('')
  })

  it('summarizePayload понимает JSON-строку и объект, не падает на мусоре', () => {
    expect(summarizePayload('{"a":1}')).toBe('{"a":1}')
    expect(summarizePayload({ a: 1 })).toBe('{"a":1}')
    expect(summarizePayload('не json')).toBe('не json')
    expect(summarizePayload(null)).toBe('')
  })

  it('describeOperation отдаёт строки очереди для списка', () => {
    const row = describeOperation({
      id: 'op-1',
      type: 'insert',
      table: 'orders',
      status: 'pending',
      created_at: 1000,
      payload: '{"id":"op-1"}',
    })

    expect(row).toEqual({
      key: 'op-1',
      type: 'insert',
      table: 'orders',
      status: 'pending',
      attempts: 0,
      createdAt: 1000,
      payload: '{"id":"op-1"}',
    })
  })

  it('formatLogEntry выводит время, уровень и сообщение', () => {
    const line = formatLogEntry({
      time: new Date('2026-01-01T10:00:00Z').toISOString(),
      level: 'warn',
      message: 'что-то',
    })

    expect(line).toContain('[warn]')
    expect(line).toContain('что-то')
    expect(formatLogEntry('raw')).toBe('raw')
  })

  it('describeSyncStatus собирает снимок синка (с «повтор через»)', () => {
    const now = 1_000_000
    const rows = describeSyncStatus(
      {
        online: false,
        syncing: true,
        requiresAuth: true,
        pendingCount: 3,
        consecutiveFailures: 2,
        nextRetryAt: now + 4000,
        lastError: 'network',
      },
      now
    )
    const value = label => rows.find(row => row.label === label)?.value

    expect(value('сеть')).toBe('офлайн')
    expect(value('синхронизация')).toBe('идёт')
    expect(value('нужен вход')).toBe('да')
    expect(value('в очереди')).toBe('3')
    expect(value('сбоев подряд')).toBe('2')
    expect(value('повтор через')).toBe('4 с')
    expect(value('последняя ошибка')).toBe('network')
  })

  it('describeSchemaVersion показывает совпадение и расхождение', () => {
    expect(describeSchemaVersion(19, 19)).toBe('19 (совпадает)')
    expect(describeSchemaVersion(19, 18)).toContain('расхождение')
    expect(describeSchemaVersion(19, null)).toContain('неизвестно')
  })
})

describe('12.5 Буфер логов (обёртка над logger)', () => {
  beforeEach(() => clearLogBuffer())

  it('в dev-режиме logger копит записи, а очистка опустошает буфер', () => {
    logger.log('первая')
    logger.warn('вторая', { a: 1 })

    const buffer = getLogBuffer()
    expect(buffer).toHaveLength(2)
    expect(buffer[0]).toMatchObject({ level: 'log', message: 'первая' })
    expect(buffer[1].level).toBe('warn')
    expect(buffer[1].message).toContain('{"a":1}')

    clearLogBuffer()
    expect(getLogBuffer()).toHaveLength(0)
  })

  it('буфер не растёт бесконечно (кольцевой лимит)', () => {
    for (let index = 0; index < LOG_BUFFER_LIMIT + 5; index += 1) {
      logger.log(`строка ${index}`)
    }

    const buffer = getLogBuffer()
    expect(buffer).toHaveLength(LOG_BUFFER_LIMIT)
    expect(buffer[buffer.length - 1].message).toBe(`строка ${LOG_BUFFER_LIMIT + 4}`)
  })
})

describe('12.5 Очередь операций: listAll видит и in-flight', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('отдаёт операции во всех статусах', async () => {
    await operationsRepo.enqueue(['op-1', 'insert', 'orders', '{"id":"op-1"}', 1000])
    await operationsRepo.enqueue(['op-2', 'update', 'orders', '{"id":2}', 2000])
    await operationsRepo.markSending(['op-2'])

    const rows = await operationsRepo.listAll()

    expect(rows.map(row => row.id)).toEqual(['op-1', 'op-2'])
    expect(rows.map(row => row.status)).toEqual(['pending', 'sending'])
  })
})

describe('12.4/12.5 UI: настройки и dev-панель', () => {
  const page = read('src/pages/OthersPage.vue')
  const panel = read('src/components/dev/DeveloperPanel.vue')

  it('в пользовательских настройках нет очистки/удаления локальной БД', () => {
    expect(page).not.toContain('опасная зона')
    expect(page).not.toContain('Полный сброс')
    expect(page).not.toContain('Удалить локальную БД')
    expect(page).not.toContain('deleteLocalDB')
  })

  it('ручной синк и бэкап остались в «данные и синхронизация»', () => {
    expect(page).toContain('данные и синхронизация')
    expect(page).toContain('Синхронизировать сейчас')
    expect(page).toContain('Создать бэкап')
  })

  it('dev-панель подключена динамическим импортом под import.meta.env.DEV', () => {
    expect(page).toMatch(/import\.meta\.env\.DEV === true/)
    expect(page).toContain("import('src/components/dev/DeveloperPanel.vue')")
    expect(page).not.toMatch(/import\s+DeveloperPanel\s+from/)
    expect(page).toContain('<component :is="DeveloperPanel"')
  })

  it('в панели есть окружение, схема, синк, очередь, логи, бэкап и сброс', () => {
    for (const marker of [
      'API_URL',
      'USE_MOCK',
      'SCHEMA_VERSION',
      'refreshStatus',
      'listAll',
      'getLogBuffer',
      'getLastBackupAt',
      'logAllServicesForDebugging',
      'fullReset',
      'deleteLocalDB',
    ]) {
      expect(panel, `в DeveloperPanel.vue нет «${marker}»`).toContain(marker)
    }
  })
})
