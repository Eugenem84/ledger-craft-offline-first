import { logger } from 'src/utils/logger'
import storage from 'src/utils/storage'

// Ключ localStorage, под которым хранится дамп локальной БД.
const DB_STORAGE_KEY = 'sqljs_db'

// IndexedDB — резервное хранилище на случай переполнения localStorage
// (лимит ~5 МБ) или когда дамп большой (много заказов/товаров).
const IDB_DB_NAME = 'ledgercraft-db'
const IDB_STORE_NAME = 'kv'
const IDB_KEY = 'sqljs_db'

// Версия схемы IndexedDB (БД с одним стором). ⚠️ Прежняя версия этого файла открывала
// БД без версии и без `onupgradeneeded`, поэтому в браузерах пользователей уже могла
// остаться пустая БД версии 1 **без стора** — её лечит `openIdb()` (пересоздаёт).
const IDB_VERSION = 2

// Страховка на загрузку: boot приложения не должен ждать IndexedDB бесконечно
// (например, БД занята другой вкладкой и событие не приходит) — тогда стартуем
// с пустой базой, а не с чёрным экраном.
const IDB_LOAD_TIMEOUT_MS = 3000

/**
 * Доступен ли IndexedDB (браузер, WebView Capacitor). В приватном режиме и в части
 * старых WebView глобала может не быть — тогда остаётся только localStorage.
 */
function indexedDbAvailable() {
  return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function'
}

/**
 * Ожидание с гарантированным результатом: либо `promise`, либо `fallback` через `ms`.
 * Отклонение промиса не всплывает наружу (иначе оно стало бы unhandled rejection).
 */
function withTimeout(promise, ms, fallback) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms)

    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      }
    )
  })
}

/**
 * Открывает БД и **гарантирует** наличие стора `kv`.
 *
 * Стор создаётся только в `onupgradeneeded`: без него транзакция по несуществующему
 * стору падает с `NotFoundError: One of the specified object stores was not found`.
 * @returns {Promise<IDBDatabase>}
 */
function openIdb() {
  return new Promise((resolve, reject) => {
    let request

    try {
      request = indexedDB.open(IDB_DB_NAME, IDB_VERSION)
    } catch (err) {
      reject(err)
      return
    }

    request.onupgradeneeded = () => {
      const upgraded = request.result
      if (!upgraded.objectStoreNames.contains(IDB_STORE_NAME)) {
        upgraded.createObjectStore(IDB_STORE_NAME)
      }
    }

    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB open blocked by another tab'))

    request.onsuccess = () => {
      const opened = request.result

      if (opened.objectStoreNames.contains(IDB_STORE_NAME)) {
        resolve(opened)
        return
      }

      // БД, созданная прежней (сломанной) версией кода: версия уже совпадает,
      // upgrade не сработает, стора нет. Пересоздаём — данных там всё равно не было.
      opened.close()
      const drop = indexedDB.deleteDatabase(IDB_DB_NAME)
      drop.onsuccess = () => openIdb().then(resolve, reject)
      drop.onerror = () => reject(drop.error || new Error('IndexedDB delete failed'))
      drop.onblocked = () => reject(new Error('IndexedDB delete blocked by another tab'))
    }
  })
}

/**
 * Выполняет одну операцию над стором внутри транзакции.
 *
 * ⚠️ `IDBDatabase.transaction(storeNames, mode)`: **имя стора — первый аргумент**,
 * режим — второй. Раньше режим передавали первым (`db.transaction('readonly')`),
 * поэтому браузер искал стор с именем «readonly» и бросал `NotFoundError`.
 *
 * Завершение — по `oncomplete`/`onerror`/`onabort`: у нативных транзакций нет
 * `tx.done` (это API Dexie), а промис этой функции обязан завершиться **всегда** —
 * иначе висящий `await` в boot-файле оставляет приложение с чёрным экраном.
 *
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest} run
 * @returns {Promise<*>} `result` запроса (если запрос возвращается)
 */
function withStore(mode, run) {
  return openIdb().then(
    db =>
      new Promise((resolve, reject) => {
        let tx

        try {
          tx = db.transaction(IDB_STORE_NAME, mode)
          const request = run(tx.objectStore(IDB_STORE_NAME))

          tx.oncomplete = () => {
            db.close()
            resolve(request ? request.result : undefined)
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
          tx.onabort = () => {
            db.close()
            reject(tx.error || new Error('IndexedDB transaction aborted'))
          }
        } catch (err) {
          // Ошибка синхронная частью API (например, стора нет) — промис всё равно
          // должен завершиться, иначе вызывающий код повиснет.
          db.close()
          reject(err)
        }
      })
  )
}

/**
 * Пишет Uint8Array в IndexedDB (structured clone хранит его нативно).
 */
function idbPut(value) {
  return withStore('readwrite', store => store.put(value, IDB_KEY))
}

/**
 * Достаёт Uint8Array из IndexedDB (или null).
 */
function idbGet() {
  return withStore('readonly', store => store.get(IDB_KEY)).then(value => value ?? null)
}

/**
 * Очищает IndexedDB-копию дампа.
 */
function idbClear() {
  return withStore('readwrite', store => store.clear())
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
      storage.setItem(DB_STORAGE_KEY, bytesToBase64(dump))
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
   *
   * Любая проблема резервного хранилища — это **не** повод не стартовать: возвращаем
   * `null` (приложение поднимется на пустой БД), а причину пишем в лог. Плюс страховка
   * по времени: зависший IndexedDB не должен останавливать boot.
   * @returns {Promise<Uint8Array|null>}
   */
  async load() {
    const raw = storage.getItem(DB_STORAGE_KEY)
    if (raw) return base64ToBytes(raw)

    if (!indexedDbAvailable()) return null

    try {
      return await withTimeout(idbGet(), IDB_LOAD_TIMEOUT_MS, null)
    } catch (err) {
      logger.warn('[StorageAdapter] IndexedDB load failed:', err && err.message)
      return null
    }
  },

  /**
   * Очищает постоянное хранилище (localStorage + IndexedDB).
   */
  clear() {
    storage.removeItem(DB_STORAGE_KEY)
    if (indexedDbAvailable()) {
      void idbClear().catch(e => logger.warn('[StorageAdapter] IndexedDB clear failed:', e && e.message))
    }
    logger.log('[StorageAdapter] Local storage cleared.')
  }
}
