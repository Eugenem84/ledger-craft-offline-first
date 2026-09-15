// test/update-store.test.js
//
// Дефект живой сборки 1.11: кнопка «Проверить обновление» выглядела мёртвой, а в разделе
// «приложение» оставалось «обновления ещё не проверялись». Причина — в `checkNow()` результат
// `refreshCurrentVersion()` (объект версии `{versionCode, versionName}`) присваивался в
// `status` стора, то есть состояние сервиса подменялось одним значением: релиз, флаги и
// «когда проверяли» терялись.
//
// Здесь держим правила: `checkNow()` обновляет состояние только сервисом, `bind()`
// подписывается на сервис и запускает фоновую инициализацию OTA, а разовое сообщение
// «обновление применено» читается из состояния (баннер подписывается позже, чем плагин отвечает).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import updateService from 'src/services/updateService.js'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'

/** Состояние сервиса обновлений — как его отдаёт `updateService.getStatus()`. */
const { statusFactory } = vi.hoisted(() => ({
  statusFactory: () => ({
    checking: false,
    online: null,
    error: null,
    lastCheckedAt: 0,
    current: { versionCode: 12, versionName: '1.11' },
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
  }),
}))

vi.mock('src/services/updateService.js', () => ({
  default: {
    getStatus: vi.fn(() => statusFactory()),
    subscribe: vi.fn(() => () => {}),
    consumeInstalledVersion: vi.fn(() => null),
    startBundleSupport: vi.fn(),
    clearDismiss: vi.fn(),
    refreshCurrentVersion: vi.fn(),
    check: vi.fn(),
    dismiss: vi.fn(),
    clearAppliedBundleNotice: vi.fn(),
  },
}))

function freshStore() {
  setActivePinia(createPinia())

  return useUpdateStore()
}

beforeEach(() => {
  updateService.getStatus.mockReturnValue(statusFactory())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('15.13 стор обновлений: состояние не подменяется версией', () => {
  it('checkNow() перечитывает версию, но состояние берёт у сервиса', async () => {
    updateService.refreshCurrentVersion.mockResolvedValue({ versionCode: 12, versionName: '1.11' })
    updateService.check.mockResolvedValue({ ...statusFactory(), lastCheckedAt: 1234, online: true })

    const store = freshStore()
    const status = await store.checkNow()

    expect(updateService.refreshCurrentVersion).toHaveBeenCalled()
    expect(status).toMatchObject({ lastCheckedAt: 1234, online: true })

    // Главное: в сторе полноценное состояние, а не объект версии.
    expect(store.status.versionCode).toBeUndefined()
    expect(store.status.lastCheckedAt).toBe(1234)
    expect(store.statusText).not.toContain('ещё не проверялись')
  })

  it('bind() подписывается на сервис и включает фоновую инициализацию OTA', () => {
    const store = freshStore()

    store.bind()

    expect(updateService.subscribe).toHaveBeenCalled()
    expect(updateService.startBundleSupport).toHaveBeenCalled()
    expect(updateService.consumeInstalledVersion).toHaveBeenCalled()

    store.unbind()
  })

  it('«обновление применено» читается из состояния сервиса', () => {
    updateService.getStatus.mockReturnValue({ ...statusFactory(), appliedBundle: '1.11.260915-1219' })

    const store = freshStore()

    expect(store.appliedBundleVersion).toBe('1.11.260915-1219')
  })

  it('состояние без бандла не показывает OTA-сценарий', () => {
    const store = freshStore()

    expect(store.canApplyBundle).toBe(false)
    expect(store.otaMode).toBe(false)
    expect(store.view.visible).toBe(false)
  })
})
