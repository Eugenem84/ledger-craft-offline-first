// test/backup-encoding.test.js
//
// Задача 14.17 (живые отчёты мастеров 14.09.2026 и 16.10.2026, хвост отчёта на **боевом**
// контуре): `[Backup] Documents недоступна, пишу в приватную папку: 'writeFile' failed with:
// bad base-64` и сразу за ней `[Backup] Автобэкап не удался`. То есть на Android авто-бэкап
// **не создавался вообще**, и второй строкой падала выгрузка логов из «Режима разработчика».
//
// Причина: у `@capacitor/filesystem` `writeFile` без `encoding` считает `data` **base64**
// (см. `WriteFileOptions`: «If not provided, data is written as base64 encoded»), а мы
// передаём обычный текст (JSON бэкапа, текстовый лог) — плагин падал на декодировании.
//
// Плагина в тестовой среде нет, а `writeNativeBackup` — приватная функция сервиса, поэтому
// проверяем контракт структурно: в каждом вызове `writeFile` кодировка задана явно (UTF8).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

/** Все вызовы `Filesystem.writeFile({ … })` в файле. */
const writeFileCalls = source => source.match(/Filesystem\.writeFile\(\{[\s\S]*?\}\)/g) || []

describe('14.17 запись файлов на Android: явная кодировка UTF8', () => {
  it('автобэкап: оба вызова (Documents и приватная папка) пишут UTF8', () => {
    const service = read('src/services/backupService.js')
    const calls = writeFileCalls(service)

    expect(calls.length).toBe(2)
    for (const call of calls) {
      expect(call).toContain('encoding: Encoding.UTF8')
      expect(call).toContain('data: json')
    }
    expect(service).toContain("import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'")
  })

  it('выгрузка логов: оба вызова пишут UTF8 (иначе текст лога не сохраняется)', () => {
    const service = read('src/services/logExport.js')
    const calls = writeFileCalls(service)

    expect(calls.length).toBe(2)
    for (const call of calls) {
      expect(call).toContain('encoding: Encoding.UTF8')
    }
    expect(service).toContain('Encoding')
  })
})
