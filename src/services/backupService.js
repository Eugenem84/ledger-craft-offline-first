// src/services/backupService.js
//
// Резервное копирование локальной БД — задача 4.4.
//
// На Android база — это файл, поэтому копию делает плагин: `exportToJson('full')`
// выгружает схему и данные одним JSON, а `@capacitor/filesystem` кладёт его в
// документы устройства (файл можно выгрузить/переслать). Если публичная папка
// Documents недоступна (на Android ≤ 10 она требует разрешений на внешнее хранилище),
// бэкап уходит в приватную папку приложения — она доступна всегда, но удаляется
// вместе с приложением.
//
// В браузере (sql.js) БД живёт в памяти и в localStorage, поэтому бэкап — это
// скачивание дампа `.sqlite` файлом.
//
// Автобэкап: раз в сутки при старте нативного приложения (см. boot/db.js). Отметка
// «когда сделали» лежит в таблице `meta`.
import { logger } from 'src/utils/logger'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { getAdapter } from 'src/database/db.js'
import { isNativePlatform } from 'src/utils/platform.js'
import { getValue, setValue } from 'src/repositories/metaRepo.js'
import { SCHEMA_VERSION } from 'src/database/schema-version.js'

const BACKUP_PREFIX = 'ledgercraft-backup-'
const BACKUP_EXTENSION = '.json'
const LAST_BACKUP_KEY = 'last_backup_at'
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Метка времени для имени файла: `2026-09-12_09-44-10`.
 * @param {Date} [date]
 */
function fileStamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  return `${day}_${time}`
}

/**
 * Кладёт JSON-бэкап в файловую систему устройства.
 * @param {string} fileName
 * @param {string} json
 * @returns {Promise<{ uri: string, directory: string }>}
 */
async function writeNativeBackup(fileName, json) {
  try {
    const result = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Documents,
      recursive: true,
    })
    return { uri: result.uri, directory: 'Documents' }
  } catch (err) {
    logger.warn('[Backup] Documents недоступна, пишу в приватную папку:', err?.message)
    const result = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Data,
      recursive: true,
    })
    return { uri: result.uri, directory: 'Data' }
  }
}

/**
 * Скачивает дамп БД файлом (браузерный путь).
 * @param {Uint8Array} bytes
 * @param {string} fileName
 */
function downloadBytes(bytes, fileName) {
  if (typeof document === 'undefined') {
    throw new Error('[Backup] Скачивание бэкапа доступно только в браузере')
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/x-sqlite3' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Создаёт бэкап локальной БД.
 * @returns {Promise<{fileName: string, size: number, format: string, createdAt: string, uri?: string, directory?: string}>}
 */
export async function createBackup() {
  const adapter = getAdapter()
  const createdAt = new Date().toISOString()
  const stamp = fileStamp()

  if (isNativePlatform()) {
    if (typeof adapter.exportDatabaseJson !== 'function') {
      throw new Error('[Backup] Активный адаптер не умеет выгружать БД в JSON')
    }

    const json = await adapter.exportDatabaseJson()
    const fileName = `${BACKUP_PREFIX}${stamp}.json`
    const { uri, directory } = await writeNativeBackup(fileName, json)
    await setValue(LAST_BACKUP_KEY, createdAt)
    logger.log(`[Backup] Бэкап создан: ${uri} (${json.length} символов)`)

    return { fileName, uri, directory, size: json.length, format: 'json', createdAt }
  }

  if (typeof adapter.exportDatabaseBytes !== 'function') {
    throw new Error('[Backup] Активный адаптер не умеет отдавать дамп БД')
  }

  const bytes = await adapter.exportDatabaseBytes()
  const fileName = `${BACKUP_PREFIX}${stamp}.sqlite`
  downloadBytes(bytes, fileName)
  await setValue(LAST_BACKUP_KEY, createdAt)
  logger.log(`[Backup] Дамп отправлен на скачивание: ${fileName} (${bytes.length} байт)`)

  return { fileName, size: bytes.length, format: 'sqlite', createdAt }
}

/**
 * Список JSON-бэкапов на устройстве (задача 11.9).
 *
 * Только нативная платформа: в браузере бэкап — это дамп `.sqlite` (только выгрузка),
 * а не JSON, поэтому восстанавливать там нечего. Смотрим обе папки, куда пишет
 * `writeNativeBackup()`: публичные `Documents` и приватные `Data` (фолбэк).
 * Новые файлы — первыми: в имени есть метка времени.
 *
 * @param {{ Filesystem?: object, Directory?: object, isNative?: () => boolean }} [deps]
 * @returns {Promise<Array<{fileName: string, directory: string, directoryLabel: string, mtime?: number}>>}
 */
export async function listBackups({
  Filesystem: fs = Filesystem,
  Directory: dir = Directory,
  isNative = isNativePlatform,
} = {}) {
  if (!isNative()) return []

  const locations = [
    { directory: dir.Documents, label: 'Documents' },
    { directory: dir.Data, label: 'Data' },
  ]
  const backups = []

  for (const { directory, label } of locations) {
    try {
      const { files = [] } = await fs.readdir({ path: '', directory })

      for (const entry of files) {
        const name = typeof entry === 'string' ? entry : entry?.name
        if (!name || !name.startsWith(BACKUP_PREFIX) || !name.endsWith(BACKUP_EXTENSION)) continue

        backups.push({ fileName: name, directory, directoryLabel: label, mtime: entry?.mtime })
      }
    } catch (err) {
      logger.warn(`[Backup] Не удалось прочитать папку ${label}:`, err?.message)
    }
  }

  return backups.sort((a, b) => b.fileName.localeCompare(a.fileName))
}

/**
 * Разбирает JSON-бэкап и проверяет, что это дамп LedgerCraft.
 *
 * Нативный `exportToJson()` кладёт в файл сам `JsonSQLite` (top-level `database`,
 * `version`, `mode`, `tables`), но обёртку `{ export: JsonSQLite }` тоже принимаем —
 * формат экспорта у разных версий плагина отличается.
 *
 * @param {string} json
 * @returns {object} распарсенный `JsonSQLite`
 */
export function parseBackupJson(json) {
  let parsed

  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('[Backup] Файл не является JSON')
  }

  const data = parsed?.export && typeof parsed.export === 'object' ? parsed.export : parsed

  if (!data || typeof data !== 'object' || typeof data.database !== 'string' || !Array.isArray(data.tables)) {
    throw new Error('[Backup] Это не бэкап LedgerCraft')
  }

  return data
}

/**
 * Восстанавливает локальную БД из JSON-бэкапа (задача 11.9).
 *
 * Это **аварийный путь без сервера** (сервер потерян/недоступен, аккаунт удалён):
 * обычный перенос на новый телефон делается входом и синхронизацией, а не этим
 * вызовом. Данные читаются из файла и **полностью заменяют** текущую локальную БД.
 *
 * Версия схемы бэкапа сверяется с текущей (`SCHEMA_VERSION`, задача 4.5) **до** импорта:
 * дамп от другой версии приложения не должен молча сломать схему.
 *
 * @param {{ fileName: string, directory?: string }} target
 * @param {{ Filesystem?: object, Encoding?: object, isNative?: () => boolean, getAdapter?: () => object, schemaVersion?: number }} [deps]
 * @returns {Promise<{ fileName: string, schemaVersion: number }>}
 */
export async function restoreBackup({ fileName, directory = Directory.Documents } = {}, {
  Filesystem: fs = Filesystem,
  Encoding: encoding = Encoding,
  isNative = isNativePlatform,
  getAdapter: adapterProvider = getAdapter,
  schemaVersion = SCHEMA_VERSION,
} = {}) {
  if (!isNative()) {
    throw new Error('[Backup] Восстановление доступно только на устройстве (там бэкап — JSON)')
  }
  if (!fileName) {
    throw new Error('[Backup] Не выбран файл бэкапа')
  }

  const { data } = await fs.readFile({ path: fileName, directory, encoding: encoding.UTF8 })
  const json = typeof data === 'string' ? data : String(data)

  const backup = parseBackupJson(json)

  if (Number(backup.version) !== Number(schemaVersion)) {
    throw new Error(
      `[Backup] Версия схемы бэкапа (${backup.version}) не совпадает с текущей (${schemaVersion}): ` +
      'восстановите дамп той версией приложения, которая его создала'
    )
  }

  const adapter = adapterProvider()

  if (typeof adapter.importDatabaseJson !== 'function') {
    throw new Error('[Backup] Активный адаптер не умеет импортировать БД из JSON')
  }

  // Плагин импортирует только с `overwrite: true`: иначе при совпадающей версии
  // схемы и непустой БД импорт — no-op (проверено по реализации плагина, 11.9).
  backup.overwrite = true

  await adapter.importDatabaseJson(JSON.stringify(backup))

  logger.log(`[Backup] Восстановлено из «${fileName}» (версия схемы ${backup.version})`)

  return { fileName, schemaVersion: backup.version }
}

/**
 * Когда делали последний бэкап (ISO-строка) — для UI.
 * @returns {Promise<string|null>}
 */
export async function getLastBackupAt() {
  return getValue(LAST_BACKUP_KEY)
}

/**
 * Автобэкап: не чаще раза в сутки, только на нативной платформе.
 * Не бросает исключение — сбой бэкапа не должен ломать запуск приложения.
 * @param {number} [now] текущее время (мс), параметр нужен для проверок
 * @returns {Promise<object|null>} описание бэкапа или null, если он не нужен/не удался
 */
export async function autoBackupIfDue(now = Date.now()) {
  if (!isNativePlatform()) return null

  try {
    const last = Date.parse((await getLastBackupAt()) || '')
    if (Number.isFinite(last) && now - last < AUTO_BACKUP_INTERVAL_MS) return null

    return await createBackup()
  } catch (err) {
    logger.warn('[Backup] Автобэкап не удался:', err?.message)
    return null
  }
}

