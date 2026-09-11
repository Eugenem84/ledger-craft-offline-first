import { logger } from 'src/utils/logger'

// Ключ localStorage, под которым хранится дамп локальной БД.
const DB_STORAGE_KEY = 'sqljs_db'

// IndexedDB — резервное хранилище на случай переполнения localStorage
// (лимит ~5 МБ) или когда дамп большой (много заказов/товаров).
const IDB_DB_NAME = 'ledgercraft-db'
const IDB_STORE_NAME = 'kv'
const IDB_KEY = 'sqljs_db'

/**
 * Доступен ли современный IndexedDB-глобал (Chrome 131+ / 2025+).
 * В браузерах постарше и в части WebView может отсутствовать — тогда
 * работаем только с localStorage (основной путь).
 */
function indexedDbAvailable() {
  return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function'
}

/**
 * Пишет Uint8Array в IndexedDB (structured clone хранит его нативно).
 */
function idbPut(value) {
  return new Promise((resolve, reject) => {
    try {
      const openReq = indexedDB.open(IDB_DB_NAME)
      openReq.onsuccess = () => {
        const db = openReq.result
        const tx = db.transaction('readwrite')
        tx.objectStore(IDB_STORE_NAME).put(value, IDB_KEY)
        tx.done.onsuccess = () => resolve()
        tx.done.onerror = () => reject(tx.done.error)
      }
      openReq.onerror = () => reject(openReq.error)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Достаёт Uint8Array из IndexedDB (или null).
 */
function idbGet() {
  return new Promise((resolve, reject) => {
    try {
      const openReq = indexedDB.open(IDB_DB_NAME)
      openReq.onsuccess = () => {
        const db = openReq.result
        const tx = db.transaction('readonly')
        const getReq = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY)
        tx.done.onsuccess = () => resolve(getReq.result ?? null)
        tx.done.onerror = () => reject(tx.done.error)
      }
      openReq.onerror = () => {
        // «нет БД» — это нормально (ещё ничего не сохраняли)
        const err = openReq.error
        if (err && (err.name === 'NotFoundError' || /not found/i.test(String(err)))) {
          resolve(null)
        } else {
          reject(err)
        }
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Очищает IndexedDB-копию дампа.
 */
function idbClear() {
  return new Promise((resolve, reject) => {
    try {
      const openReq = indexedDB.open(IDB_DB_NAME)
      openReq.onsuccess = () => {
        const db = openReq.result
        const tx = db.transaction('readwrite')
        tx.objectStore(IDB_STORE_NAME).clear()
        tx.done.onsuccess = () => resolve()
        tx.done.onerror = () => reject(tx.done.error)
      }
      openReq.onerror = reject
    } catch (err) {
      reject(err)
    }
  })
}

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
   * Сохраняет дамп базы в постоянное хранилище.
   * @param {Uint8Array} dump результат db.export()
   */
  save(dump) {
    try {
      localStorage.setItem(DB_STORAGE_KEY, bytesToBase64(dump))
      logger.log(`[StorageAdapter] DB dump saved (${dump.length} bytes).`)
    } catch (err) {
      // localStorage переполнен (лимит ~5 МБ) → пробуем IndexedDB
      logger.warn(`[StorageAdapter] localStorage full (${dump.length} bytes):`, err && err.message)
      if (indexedDbAvailable()) {
        void idbPut(dump)
          .then(() => logger.log('[StorageAdapter] DB dump saved to IndexedDB.'))
          .catch(e => console.error('[StorageAdapter] IndexedDB save failed:', e))
      } else {
        console.error(
          '[StorageAdapter] localStorage QUOTA exceeded and IndexedDB is unavailable — данные могут не пережить перезапуск!'
        )
      }
    }
  },

  /**
   * Загружает сохранённый дамп базы (сначала localStorage, затем IndexedDB).
   * @returns {Promise<Uint8Array|null>}
   */
  async load() {
    const raw = localStorage.getItem(DB_STORAGE_KEY)
    if (raw) return base64ToBytes(raw)

    if (indexedDbAvailable()) {
      try {
        const fromIdb = await idbGet()
        if (fromIdb) return fromIdb
      } catch (err) {
        logger.warn('[StorageAdapter] IndexedDB load failed:', err && err.message)
      }
    }
    return null
  },

  /**
   * Очищает постоянное хранилище (localStorage + IndexedDB).
   */
  clear() {
    localStorage.removeItem(DB_STORAGE_KEY)
    if (indexedDbAvailable()) {
      void idbClear().catch(e => logger.warn('[StorageAdapter] IndexedDB clear failed:', e && e.message))
    }
    logger.log('[StorageAdapter] Local storage cleared.')
  }
}
