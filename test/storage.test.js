// test/storage.test.js
//
// Задача 7.3: универсальное хранилище `src/utils/storage.js`. Модуль читают
// `api.js` (sync_id, токен) и `storage-adapter.js` (дамп БД), поэтому проверяем
// round-trip, различие «мягкой» и обычной записи при переполнении, фолбэк в память
// без localStorage и устойчивость к запрету доступа к storage.
import { describe, it, expect, vi } from 'vitest'

const originalLocalStorage = globalThis.localStorage

function installBrokenLocalStorage() {
  // `undefined` глобал равносилен его отсутствию: storage.js уйдёт в память.
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    configurable: true,
    writable: true,
  })
}

function restoreLocalStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  })
}

describe('7.3 универсальное хранилище', () => {
  it('пишет, читает и удаляет значение', async () => {
    const storage = (await import('src/utils/storage.js')).default

    expect(storage.isPersistentStorage()).toBe(true)

    storage.setItem('probe', 'value')
    expect(storage.getItem('probe')).toBe('value')

    storage.removeItem('probe')
    expect(storage.getItem('probe')).toBeNull()
  })

  it('trySetItem не бросает при переполнении, а setItem — бросает', async () => {
    const storage = (await import('src/utils/storage.js')).default
    const spy = vi
      .spyOn(globalThis.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })

    expect(storage.trySetItem('big', 'x')).toBe(false)
    expect(() => storage.setItem('big', 'x')).toThrow('quota exceeded')

    spy.mockRestore()
  })

  it('getItem не бросает, если доступ к storage запрещён', async () => {
    const storage = (await import('src/utils/storage.js')).default
    const spy = vi
      .spyOn(globalThis.localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('access denied')
      })

    expect(storage.getItem('probe')).toBeNull()

    spy.mockRestore()
  })

  it('без localStorage работает в памяти и не считается персистентным', async () => {
    installBrokenLocalStorage()
    vi.resetModules()

    try {
      const storage = (await import('src/utils/storage.js')).default

      expect(storage.isPersistentStorage()).toBe(false)

      storage.setItem('probe', 'in-memory')
      expect(storage.getItem('probe')).toBe('in-memory')

      storage.removeItem('probe')
      expect(storage.getItem('probe')).toBeNull()
    } finally {
      restoreLocalStorage()
      vi.resetModules()
    }
  })
})
