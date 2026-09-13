// test/update-service.test.js
//
// Фаза 13, задачи 13.5/13.7: сервис проверки обновлений. Сеть подменяем моком
// `apiClient` (как в `test/sync-auth.test.js`), БД и нативный плагин не нужны:
// свою версию тест задаёт напрямую, поэтому проверка работает без Capacitor.
//
// Что важно зафиксировать: офлайн и 404 — не ошибки (приложение офлайн-первый),
// «позже» не действует на обязательное обновление, а кэш переживает перезапуск.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { apiClient } from 'src/services/api.js'
import updateService from 'src/services/updateService.js'
import storage from 'src/utils/storage.js'

const RELEASE = {
  versionCode: 3,
  versionName: '1.2',
  apkUrl: 'https://example.test/api/download-apk?versionCode=3',
  sha256: 'deadbeef',
  sizeBytes: 1024,
  mandatory: false,
  minSupportedVersionCode: 0,
  notes: 'Чиним склад',
}

const STORAGE_KEYS = [
  'update_release',
  'update_checked_at',
  'update_dismissed_version_code',
  'update_current_version',
  'update_pending_version_code',
]

/** Сброс singleton-сервиса между тестами (как `syncService` в sync-auth.test.js). */
function resetService({ current = { versionCode: 2, versionName: '1.1' } } = {}) {
  updateService.stopAutoCheck()

  updateService.status = {
    checking: false,
    online: null,
    error: null,
    lastCheckedAt: 0,
    current: { ...current },
    release: null,
    available: false,
    mandatory: false,
    dismissed: false,
    downloading: false,
    downloadProgress: 0,
    downloadingVersion: null,
  }

  updateService._listeners = new Set()
  // Свою версию задаём заранее: иначе сервис пойдёт в нативный плагин.
  updateService._currentPromise = Promise.resolve({ ...current })
}

/** Подмена `navigator.onLine` (окружение теста может не позволить — тогда `false`). */
function setOnline(value) {
  try {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value,
      configurable: true,
      writable: true,
    })

    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  resetService()
  STORAGE_KEYS.forEach(key => storage.removeItem(key))
})

afterEach(() => {
  STORAGE_KEYS.forEach(key => storage.removeItem(key))
  setOnline(true)
  vi.restoreAllMocks()
})

describe('13.7 проверка обновления', () => {
  it('новая версия на сервере → есть что обновлять, ответ уезжает в кэш', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: RELEASE })

    const status = await updateService.check({ force: true })

    expect(apiClient.get).toHaveBeenCalledWith('/app-version')
    expect(status).toMatchObject({ available: true, mandatory: false, error: null, online: true })
    expect(status.release).toMatchObject({
      versionCode: 3,
      versionName: '1.2',
      notes: 'Чиним склад',
      legacy: false,
    })
    expect(storage.getItem('update_checked_at')).toBeTruthy()
    expect(JSON.parse(storage.getItem('update_release'))).toMatchObject({ versionCode: 3 })
  })

  it('та же версия на сервере → баннера нет', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { ...RELEASE, versionCode: 2, versionName: '1.1' },
    })

    expect((await updateService.check({ force: true })).available).toBe(false)
  })

  it('обязательное обновление: флаг релиза и минимально поддерживаемая версия', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { ...RELEASE, mandatory: true } })

    expect((await updateService.check({ force: true })).mandatory).toBe(true)

    resetService({ current: { versionCode: 1, versionName: '1.0' } })
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { ...RELEASE, minSupportedVersionCode: 2 },
    })

    expect((await updateService.check({ force: true })).mandatory).toBe(true)
  })

  it('404 (ничего не опубликовано) — не ошибка связи', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({ response: { status: 404 } })

    const status = await updateService.check({ force: true })

    expect(status).toMatchObject({ checking: false, error: null, release: null, available: false })
  })

  it('сбой сети не роняет приложение и не блокирует работу', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network Error'))

    const status = await updateService.check({ force: true })

    expect(status.checking).toBe(false)
    expect(status.error).toBe('Network Error')
    expect(status.available).toBe(false)
  })

  it('офлайн: в сеть не ходим, состояние «нет интернета»', async () => {
    const spy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: RELEASE })

    if (!setOnline(false)) return // окружение не даёт подменить navigator.onLine

    const status = await updateService.check({ force: true })

    expect(spy).not.toHaveBeenCalled()
    expect(status).toMatchObject({ online: false, error: null, available: false })
  })

  it('повторная проверка не долбит сервер (пауза), force — обходит', async () => {
    const spy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: RELEASE })

    await updateService.check({ force: true })
    await updateService.check()

    expect(spy).toHaveBeenCalledTimes(1)

    await updateService.check({ force: true })

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('кэш поднимается при старте: состояние известно до сети', () => {
    storage.setItem('update_release', JSON.stringify(RELEASE))
    storage.setItem('update_checked_at', String(Date.now()))
    storage.setItem('update_current_version', JSON.stringify({ versionCode: 2, versionName: '1.1' }))

    const status = updateService.restore()

    expect(status.release).toMatchObject({ versionCode: 3 })
    expect(status.available).toBe(true)
    expect(status.lastCheckedAt).toBeGreaterThan(0)
  })

  it('«позже» скрывает баннер, но не отменяет обязательное обновление', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: RELEASE })
    await updateService.check({ force: true })

    expect(updateService.dismiss().dismissed).toBe(true)
    expect(storage.getItem('update_dismissed_version_code')).toBe('3')

    // Новый релиз — «позже» на него не распространяется.
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { ...RELEASE, versionCode: 4, versionName: '1.3' },
    })
    expect((await updateService.check({ force: true })).dismissed).toBe(false)

    // Обязательное обновление «позже» игнорирует.
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { ...RELEASE, versionCode: 5, mandatory: true },
    })
    await updateService.check({ force: true })

    expect(updateService.dismiss().dismissed).toBe(false)
  })

  it('флаг «установку запускали» закрывается, когда версия действительно выросла', () => {
    storage.setItem('update_pending_version_code', '3')

    expect(updateService.consumeInstalledVersion()).toBeNull()

    resetService({ current: { versionCode: 3, versionName: '1.2' } })

    expect(updateService.consumeInstalledVersion()).toBe(3)
    // Сообщение показываем один раз.
    expect(updateService.consumeInstalledVersion()).toBeNull()
  })
})
