// test/update-version.test.js
//
// Дефект живой сборки (1.10, 15.09.2026): на Android в «Ещё → приложение» показывалось
// «Версия неизвестна», хотя веб-сборка значение показывала. Причина — единственный
// источник (`@capacitor/app`) плюс то, что неудачное чтение **запоминалось навсегда**.
//
// Здесь проверяем новую логику: два независимых нативных источника (App.getInfo →
// плагин OTA), таймаут на молчащий вызов и повторные попытки вместо «залипания».
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { App } from '@capacitor/app'
import updateService from 'src/services/updateService.js'
import storage from 'src/utils/storage.js'
import * as liveUpdate from 'src/utils/liveUpdate.js'

// На устройстве: `isNativePlatform()` → true, иначе нативная ветка не выполняется.
vi.mock('src/utils/platform.js', async () => {
  const actual = await vi.importActual('src/utils/platform.js')

  return { ...actual, isNativePlatform: vi.fn(() => true) }
})

vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn() },
}))

vi.mock('src/utils/liveUpdate.js', () => ({
  NATIVE_CALL_TIMEOUT_MS: 3000,
  isLiveUpdateSupported: vi.fn(() => true),
  hasLiveUpdatePlugin: vi.fn(async () => true),
  getCurrentBundleId: vi.fn(async () => null),
  getAppVersionCode: vi.fn(async () => null),
  getAppVersionName: vi.fn(async () => null),
  ready: vi.fn(async () => true),
  downloadBundle: vi.fn(async () => ({})),
  setNextBundle: vi.fn(async () => undefined),
  reloadApplication: vi.fn(async () => undefined),
  reset: vi.fn(async () => undefined),
}))

const CACHE_KEY = 'update_current_version'

function resetService() {
  updateService.stopAutoCheck()
  updateService.status = {
    checking: false,
    online: null,
    error: null,
    lastCheckedAt: 0,
    current: { versionCode: null, versionName: null },
    release: null,
    available: false,
    mandatory: false,
    dismissed: false,
    downloading: false,
    downloadProgress: 0,
    downloadingVersion: null,
    currentBundleId: null,
    bundleAvailable: false,
    bundleDismissed: false,
    bundleReady: false,
    pendingBundle: null,
    downloadingBundle: false,
    bundleProgress: 0,
    appliedBundle: null,
  }

  updateService._listeners = new Set()
  updateService._currentPromise = null
  updateService._bundleResolved = false
  updateService._readyRetried = false
  updateService._readyConfirmed = false
}

beforeEach(() => {
  resetService()
  storage.removeItem(CACHE_KEY)
  storage.removeItem('error_log_buffer')

  App.getInfo.mockReset()
  liveUpdate.getAppVersionCode.mockReset()
  liveUpdate.getAppVersionName.mockReset()
})

afterEach(() => {
  storage.removeItem(CACHE_KEY)
  storage.removeItem('error_log_buffer')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('15.12 своя версия приложения на устройстве', () => {
  it('основной путь: версия из @capacitor/app, удачное чтение кэшируется', async () => {
    App.getInfo.mockResolvedValue({ build: '12', version: '1.11' })

    const current = await updateService.refreshCurrentVersion()

    expect(current).toEqual({ versionCode: 12, versionName: '1.11' })
    expect(JSON.parse(storage.getItem(CACHE_KEY))).toEqual({ versionCode: 12, versionName: '1.11' })
    // Фолбэк не трогаем: основного источника достаточно.
    expect(liveUpdate.getAppVersionCode).not.toHaveBeenCalled()
  })

  it('App.getInfo() упал → версия берётся из плагина OTA', async () => {
    App.getInfo.mockRejectedValue(new Error('Unable to get App Info'))
    liveUpdate.getAppVersionCode.mockResolvedValue('12')
    liveUpdate.getAppVersionName.mockResolvedValue('1.11')

    const current = await updateService.refreshCurrentVersion()

    expect(current).toEqual({ versionCode: 12, versionName: '1.11' })
    expect(JSON.parse(storage.getItem(CACHE_KEY))).toEqual({ versionCode: 12, versionName: '1.11' })
  })

  it('молчащий App.getInfo() не блокирует: таймаут и переход к фолбэку', async () => {
    vi.useFakeTimers()
    App.getInfo.mockImplementation(() => new Promise(() => {}))
    liveUpdate.getAppVersionCode.mockResolvedValue('12')
    liveUpdate.getAppVersionName.mockResolvedValue('1.11')

    const pending = updateService.refreshCurrentVersion()

    await vi.advanceTimersByTimeAsync(3100)

    expect(await pending).toEqual({ versionCode: 12, versionName: '1.11' })
  })

  it('провал не запоминается: следующая попытка снова спрашивает источники', async () => {
    App.getInfo.mockRejectedValue(new Error('Unable to get App Info'))
    liveUpdate.getAppVersionCode.mockRejectedValue(new Error('нет ответа за 3000 мс'))
    liveUpdate.getAppVersionName.mockRejectedValue(new Error('нет ответа за 3000 мс'))

    expect(await updateService.refreshCurrentVersion()).toEqual({
      versionCode: null,
      versionName: null,
    })

    const firstAttempt = App.getInfo.mock.calls.length

    await updateService.refreshCurrentVersion()

    expect(App.getInfo.mock.calls.length).toBeGreaterThan(firstAttempt)
  })

  it('когда источники молчат — показываем последнее известное (кэш)', async () => {
    storage.setItem(CACHE_KEY, JSON.stringify({ versionCode: 11, versionName: '1.10' }))
    App.getInfo.mockRejectedValue(new Error('Unable to get App Info'))
    liveUpdate.getAppVersionCode.mockRejectedValue(new Error('нет ответа'))
    liveUpdate.getAppVersionName.mockRejectedValue(new Error('нет ответа'))

    expect(await updateService.refreshCurrentVersion()).toEqual({
      versionCode: 11,
      versionName: '1.10',
    })
  })

  it('обычный вызов не дёргает нативную часть повторно (кэш промиса)', async () => {
    App.getInfo.mockResolvedValue({ build: '12', version: '1.11' })

    await updateService.loadCurrentVersion()
    await updateService.loadCurrentVersion()

    expect(App.getInfo).toHaveBeenCalledTimes(1)
  })

  it('пустой ответ App.getInfo() не считается успехом — идём в фолбэк', async () => {
    App.getInfo.mockResolvedValue({ build: null, version: null })
    liveUpdate.getAppVersionCode.mockResolvedValue('12')
    liveUpdate.getAppVersionName.mockResolvedValue('1.11')

    expect(await updateService.refreshCurrentVersion()).toEqual({
      versionCode: 12,
      versionName: '1.11',
    })
  })
})
