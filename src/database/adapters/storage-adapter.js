import { logger } from 'src/utils/logger'

// Ключ localStorage, под которым хранится дамп локальной БД.
const DB_STORAGE_KEY = 'sqljs_db'

// Uint8Array → base64 (localStorage умеет хранить только строки).
function bytesToBase64(bytes) {
  let binary = ''
  // Чанками по 0x8000, чтобы избежать переполнения стека на больших БД.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// base64 → Uint8Array.
function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export default {
  async init() {
    throw new Error('init() not implemented')
  },
  execute(sql, _params = []) {
    throw new Error('execute() not implemented')
  },
  query(sql, _params = []) {
    throw new Error('query() not implemented')
  },
  async transaction(_cb) {
    throw new Error('transaction() not implemented')
  },
  enqueueOperation(_op) {
    throw new Error('enqueueOperation() not implemented')
  },
  dequeueOperations() {
    throw new Error('dequeueOperations() not implemented')
  },
  /**
   * Сохраняет дамп базы в постоянное хранилище (localStorage).
   * @param {Uint8Array} dump результат db.export()
   */
  save(dump) {
    localStorage.setItem(DB_STORAGE_KEY, bytesToBase64(dump))
    logger.log(`[StorageAdapter] DB dump saved (${dump.length} bytes).`)
  },

  /**
   * Загружает сохранённый дамп базы.
   * @returns {Uint8Array|null}
   */
  load() {
    const raw = localStorage.getItem(DB_STORAGE_KEY)
    if (!raw) return null
    return base64ToBytes(raw)
  },

  /**
   * Очищает постоянное хранилище (например, localStorage).
   */
  clear() {
    localStorage.removeItem(DB_STORAGE_KEY)
    logger.log('[StorageAdapter] Local storage cleared.')
  }
}
