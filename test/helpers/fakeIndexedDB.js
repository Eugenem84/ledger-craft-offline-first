// test/helpers/fakeIndexedDB.js
//
// Минимальный, но честный фейк IndexedDB для тестов `storage-adapter.js`.
//
// Зачем свой, а не библиотека: нужен ровно тот контракт браузера, на котором
// ломался адаптер (Фаза 1.3 → найдено на живом прогоне 11.5). Фейк воспроизводит:
//   • `open(name, version)` — создание БД, `onupgradeneeded` при создании и при
//     повышении версии, `VersionError` при понижении;
//   • `objectStoreNames.contains(name)`;
//   • `db.transaction(storeNames, mode)` — **первый аргумент — имена сторов**;
//     при отсутствии стора бросает `NotFoundError`, как браузер
//     («One of the specified object stores was not found»);
//   • завершение транзакции строго после доставки результатов запросов —
//     `tx.oncomplete`/`onerror`/`onabort` (никакого `tx.done`, которого в
//     нативном API нет).
//
// Всё асинхронно (микрозадачи), как в браузере: обработчики, назначенные сразу
// после вызова метода, успевают получить событие.

const NOT_FOUND_MESSAGE =
  "Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found."

/** Ошибка «стора нет» — с браузерным `name` и текстом. */
export function notFoundError() {
  const error = new Error(NOT_FOUND_MESSAGE)
  error.name = 'NotFoundError'
  return error
}

/** Ошибка «версия ниже текущей» (как в спецификации). */
export function versionError() {
  const error = new Error('The requested version is lower than the existing version.')
  error.name = 'VersionError'
  return error
}

/** Значения кладём копией — structured clone в браузере тоже копирует. */
function clone(value) {
  if (value instanceof Uint8Array) return value.slice()
  return value
}

class FakeRequest {
  constructor() {
    this.result = undefined
    this.error = null
    this.onsuccess = null
    this.onerror = null
    this.onupgradeneeded = null
    this.onblocked = null
  }

  _succeed(result) {
    this.result = result
    if (typeof this.onsuccess === 'function') this.onsuccess({ target: this })
  }

  _fail(error) {
    this.error = error
    if (typeof this.onerror === 'function') this.onerror({ target: this })
  }
}

class FakeTransaction {
  constructor(db, storeNames, mode) {
    this.db = db
    this.mode = mode
    this.error = null
    this.oncomplete = null
    this.onerror = null
    this.onabort = null

    this._storeNames = Array.isArray(storeNames) ? storeNames : [storeNames]

    // Транзакция живёт, пока не выполнены запросы: «+1» — за синхронный код
    // вызывающего (он успевает добавить запросы в этой же задаче).
    this._pending = 1
    this._completed = false
    queueMicrotask(() => this._settle())
  }

  _newRequest(run) {
    const request = new FakeRequest()
    this._pending += 1

    queueMicrotask(() => {
      try {
        request._succeed(run())
      } catch (error) {
        request._fail(error)
        this.error = error
        if (typeof this.onerror === 'function') this.onerror()
      } finally {
        this._settle()
      }
    })

    return request
  }

  _settle() {
    this._pending -= 1
    if (this._pending > 0 || this._completed) return
    this._completed = true
    if (typeof this.oncomplete === 'function') this.oncomplete()
  }

  objectStore(name) {
    if (!this._storeNames.includes(name) || !this.db._stores.has(name)) {
      throw notFoundError()
    }

    const data = this.db._stores.get(name)
    const readOnly = this.mode !== 'readwrite'

    const assertWritable = () => {
      if (!readOnly) return
      const error = new Error('Transaction is read-only.')
      error.name = 'ReadOnlyError'
      throw error
    }

    return {
      put: (value, key) =>
        this._newRequest(() => {
          assertWritable()
          data.set(key, clone(value))
          return key
        }),
      get: key => this._newRequest(() => (data.has(key) ? clone(data.get(key)) : undefined)),
      clear: () =>
        this._newRequest(() => {
          assertWritable()
          data.clear()
          return undefined
        }),
    }
  }
}

/** БД фейка: сторы и версия. Экспортируется, чтобы тест мог создать «битую» БД. */
export class FakeIndexedDbDatabase {
  constructor(name, version = 1) {
    this.name = name
    this.version = version
    this._stores = new Map()

    this.objectStoreNames = {
      contains: storeName => this._stores.has(storeName),
    }
  }

  createObjectStore(storeName) {
    if (this._stores.has(storeName)) throw new Error(`Object store already exists: ${storeName}`)
    this._stores.set(storeName, new Map())
    return { name: storeName }
  }

  transaction(storeNames, mode = 'readonly') {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    const missing = names.find(storeName => !this._stores.has(storeName))
    if (missing !== undefined) throw notFoundError()

    return new FakeTransaction(this, names, mode)
  }
}

/**
 * Соединение с БД. В браузере `close()` закрывает именно соединение, а сама БД
 * (и её сторы) остаётся — поэтому каждый `open()` отдаёт новый объект, а данные
 * живут в `FakeIndexedDbDatabase`.
 */
class FakeConnection {
  constructor(db) {
    this._db = db
    this._closed = false
  }

  get name() {
    return this._db.name
  }

  get version() {
    return this._db.version
  }

  get objectStoreNames() {
    return this._db.objectStoreNames
  }

  createObjectStore(storeName) {
    return this._db.createObjectStore(storeName)
  }

  transaction(storeNames, mode) {
    if (this._closed) {
      const error = new Error('Database is closed.')
      error.name = 'InvalidStateError'
      throw error
    }

    return this._db.transaction(storeNames, mode)
  }

  close() {
    this._closed = true
  }
}

/**
 * Устанавливает `globalThis.indexedDB` в виде фейка.
 *
 * @param {{ databases?: Map<string, FakeIndexedDbDatabase>, failOpen?: boolean }} [options]
 * @returns {{ databases: Map, restore: () => void }}
 */
export function installFakeIndexedDb(options = {}) {
  const databases = options.databases || new Map()
  const failOpen = options.failOpen === true
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')

  const factory = {
    open(name, version) {
      const request = new FakeRequest()

      queueMicrotask(() => {
        if (failOpen) {
          request._fail(new Error('fake IndexedDB: open failed'))
          return
        }

        const existing = databases.get(name)
        const target = version === undefined ? (existing ? existing.version : 1) : version

        if (existing && target < existing.version) {
          request._fail(versionError())
          return
        }

        let record = existing
        let upgraded = false

        if (!record) {
          record = new FakeIndexedDbDatabase(name, target)
          databases.set(name, record)
          upgraded = true
        } else if (target > record.version) {
          record.version = target
          upgraded = true
        }

        request.result = new FakeConnection(record)

        if (upgraded && typeof request.onupgradeneeded === 'function') {
          request.onupgradeneeded({ target: request, oldVersion: 0, newVersion: target })
        }

        request._succeed(request.result)
      })

      return request
    },

    deleteDatabase(name) {
      const request = new FakeRequest()
      queueMicrotask(() => {
        databases.delete(name)
        request._succeed(undefined)
      })
      return request
    },
  }

  Object.defineProperty(globalThis, 'indexedDB', {
    value: factory,
    configurable: true,
    writable: true,
  })

  return {
    databases,
    restore() {
      if (descriptor) {
        Object.defineProperty(globalThis, 'indexedDB', descriptor)
      } else {
        delete globalThis.indexedDB
      }
    },
  }
}
