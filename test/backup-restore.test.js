// test/backup-restore.test.js
//
// Задача 11.9: восстановление из JSON-бэкапа — АВАРИЙНЫЙ путь без сервера
// (обычный перенос на новое устройство делается входом и синхронизацией).
//
// Плагина SQLite и файловой системы вне устройства нет, поэтому проверяем логику
// сервиса: разбор файла, список бэкапов, сверку версии схемы и обязательный
// `overwrite` при импорте (иначе плагин молча не заменит БД). Capacitor-плагины и
// адаптер подменяются через параметры — тот же приём, что в `preset-service.test.js`.
import { describe, it, expect, vi } from 'vitest'
import { listBackups, parseBackupJson, restoreBackup } from 'src/services/backupService.js'

const BACKUP = {
  database: 'ledgercraft',
  version: 28,
  encrypted: false,
  mode: 'full',
  tables: [],
}

describe('11.9: разбор JSON-бэкапа', () => {
  it('принимает «сырой» JsonSQLite (формат exportToJson)', () => {
    expect(parseBackupJson(JSON.stringify(BACKUP)).database).toBe('ledgercraft')
  })

  it('принимает обёртку { export: … }', () => {
    expect(parseBackupJson(JSON.stringify({ export: BACKUP })).version).toBe(28)
  })

  it('отвергает не-JSON и чужой файл', () => {
    expect(() => parseBackupJson('не json')).toThrow(/не является JSON/)
    expect(() => parseBackupJson(JSON.stringify({ hello: 1 }))).toThrow(/не бэкап LedgerCraft/)
  })
})

describe('11.9: список бэкапов', () => {
  it('в браузере бэкапов нет (там бэкап — дамп .sqlite, только выгрузка)', async () => {
    await expect(listBackups({ isNative: () => false })).resolves.toEqual([])
  })

  it('фильтрует по префиксу и отдаёт новые первыми, из обеих папок', async () => {
    const Filesystem = {
      readdir: vi.fn(async ({ directory }) => ({
        files:
          directory === 'DOCUMENTS'
            ? [
                { name: 'ledgercraft-backup-2026-09-10_10-00-00.json' },
                { name: 'ledgercraft-backup-2026-09-12_10-00-00.json' },
                { name: 'chuzhoy.json' },
              ]
            : [{ name: 'ledgercraft-backup-2026-09-11_10-00-00.json' }],
      })),
    }

    const backups = await listBackups({
      Filesystem,
      Directory: { Documents: 'DOCUMENTS', Data: 'DATA' },
      isNative: () => true,
    })

    expect(backups.map(item => item.fileName)).toEqual([
      'ledgercraft-backup-2026-09-12_10-00-00.json',
      'ledgercraft-backup-2026-09-11_10-00-00.json',
      'ledgercraft-backup-2026-09-10_10-00-00.json',
    ])
  })
})

describe('11.9: восстановление из бэкапа', () => {
  const deps = (json, adapter = { importDatabaseJson: vi.fn(async () => {}) }) => ({
    Filesystem: { readFile: vi.fn(async () => ({ data: json })) },
    Encoding: { UTF8: 'utf8' },
    isNative: () => true,
    getAdapter: () => adapter,
    schemaVersion: 28,
  })

  it('в браузере недоступно', async () => {
    const options = { ...deps('{}'), isNative: () => false }
    await expect(restoreBackup({ fileName: 'x.json' }, options)).rejects.toThrow(/только на устройстве/)
  })

  it('не восстанавливает дамп другой версии схемы', async () => {
    const options = deps(JSON.stringify({ ...BACKUP, version: 99 }))
    await expect(restoreBackup({ fileName: 'x.json' }, options)).rejects.toThrow(/Версия схемы бэкапа/)
  })

  it('импортирует с overwrite: true и возвращает версию схемы', async () => {
    const adapter = { importDatabaseJson: vi.fn(async () => {}) }
    const result = await restoreBackup({ fileName: 'b.json' }, deps(JSON.stringify(BACKUP), adapter))

    expect(result).toEqual({ fileName: 'b.json', schemaVersion: 28 })
    expect(adapter.importDatabaseJson).toHaveBeenCalledTimes(1)

    const imported = JSON.parse(adapter.importDatabaseJson.mock.calls[0][0])
    expect(imported.overwrite).toBe(true) // без этого плагин БД не заменит
    expect(imported.database).toBe('ledgercraft')
    expect(imported.tables).toEqual([])
  })

  it('ругается, если активный адаптер не умеет импорт', async () => {
    const options = deps(JSON.stringify(BACKUP), {})
    await expect(restoreBackup({ fileName: 'b.json' }, options)).rejects.toThrow(/не умеет импортировать/)
  })
})
