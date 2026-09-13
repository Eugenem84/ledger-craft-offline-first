// test/storage-adapter.test.js
//
// Хранилище дампа локальной БД (Фаза 1.3): основной путь — localStorage, резервный —
// IndexedDB (когда дамп большой и localStorage переполнен). Тесты закрывают дефект,
// найденный живым прогоном (задача 11.5): в IndexedDB-ветке режим транзакции передавали
// первым аргументом (`db.transaction('readonly')`) вместо имени стора, стор `kv` никогда
// не создавался (`onupgradeneeded` отсутствовал), а завершение ждали через `tx.done`
// из Dexie. Из-за этого `load()` не завершался, boot приложения висел и на пустом
// хранилище был чёрный экран.
//
// IndexedDB подменяется честным фейком (`test/helpers/fakeIndexedDB.js`), а не заглушкой:
// он повторяет контракт браузера, включая `NotFoundError` при отсутствующем сторе.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StorageAdapter from 'src/database/adapters/storage-adapter.js'
import { FakeIndexedDbDatabase, installFakeIndexedDb } from './helpers/fakeIndexedDB.js'

const DB_NAME = 'ledgercraft-db'
const STORE_NAME = 'kv'
const DUMP_KEY = 'sqljs_db'

let fake = null

/** Даёт микрозадачам и таймерам внутри адаптера завершиться. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/** БД фейка по имени (или undefined, если её ещё не создавали). */
const database = name => fake.databases.get(name)

/** Запрещает запись в localStorage — как при переполнении (~5 МБ). */
function failLocalStorage() {
  return vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded')
  })
}

beforeEach(() => {
  globalThis.localStorage.clear()
})

afterEach(() => {
  if (fake) fake.restore()
  fake = null
  vi.restoreAllMocks()
})

describe('1.3 хранилище дампа: localStorage + IndexedDB', () => {
  it('load() на пустом хранилище создаёт стор kv и возвращает null', async () => {
    fake = installFakeIndexedDb()

    // Регресс: раньше здесь был NotFoundError и незавершающийся промис (чёрный экран).
    await expect(StorageAdapter.load()).resolves.toBeNull()
    expect(database(DB_NAME).objectStoreNames.contains(STORE_NAME)).toBe(true)
  })

  it('load() лечит БД версии 1 без стора (наследие прежнего кода)', async () => {
    fake = installFakeIndexedDb({
      databases: new Map([[DB_NAME, new FakeIndexedDbDatabase(DB_NAME, 1)]]),
    })

    await expect(StorageAdapter.load()).resolves.toBeNull()
    expect(database(DB_NAME).objectStoreNames.contains(STORE_NAME)).toBe(true)
  })

  it('load() пересоздаёт БД, у которой версия уже совпадает, а стора нет', async () => {
    // Самый неприятный случай: upgrade не сработает, спасает только пересоздание.
    fake = installFakeIndexedDb({
      databases: new Map([[DB_NAME, new FakeIndexedDbDatabase(DB_NAME, 2)]]),
    })

    await expect(StorageAdapter.load()).resolves.toBeNull()
    expect(database(DB_NAME).objectStoreNames.contains(STORE_NAME)).toBe(true)
  })

  it('localStorage — основной путь: IndexedDB не трогаем, если дамп сохранился', async () => {
    fake = installFakeIndexedDb()

    StorageAdapter.save(new Uint8Array([5, 5]))

    const restored = await StorageAdapter.load()
    expect(Array.from(restored)).toEqual([5, 5])
    expect(database(DB_NAME)).toBeUndefined()
  })

  it('при переполнении localStorage дамп уходит в IndexedDB и читается обратно', async () => {
    fake = installFakeIndexedDb()
    const dump = new Uint8Array([1, 2, 3, 250])

    const quota = failLocalStorage()
    StorageAdapter.save(dump)
    await flush()
    quota.mockRestore()

    expect(globalThis.localStorage.getItem(DUMP_KEY)).toBeNull()

    const restored = await StorageAdapter.load()
    expect(restored).toBeInstanceOf(Uint8Array)
    expect(Array.from(restored)).toEqual([1, 2, 3, 250])
  })

  it('сбой IndexedDB не мешает старту: load() → null (не зависает)', async () => {
    fake = installFakeIndexedDb({ failOpen: true })

    await expect(StorageAdapter.load()).resolves.toBeNull()
  })

  it('без IndexedDB load() → null, а save() не бросает', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')

    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    try {
      await expect(StorageAdapter.load()).resolves.toBeNull()
      expect(() => StorageAdapter.save(new Uint8Array([9]))).not.toThrow()
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'indexedDB', descriptor)
      } else {
        delete globalThis.indexedDB
      }
    }
  })

  it('clear() убирает дамп и из localStorage, и из IndexedDB', async () => {
    fake = installFakeIndexedDb()

    const quota = failLocalStorage()
    StorageAdapter.save(new Uint8Array([7, 7, 7]))
    await flush()
    quota.mockRestore()

    expect(Array.from(await StorageAdapter.load())).toEqual([7, 7, 7])

    StorageAdapter.clear()
    await flush()

    expect(globalThis.localStorage.getItem(DUMP_KEY)).toBeNull()
    await expect(StorageAdapter.load()).resolves.toBeNull()
  })
})
