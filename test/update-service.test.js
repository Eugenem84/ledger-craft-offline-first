// test/update-service.test.js
//
// Фаза 13, задачи 13.5/13.7: сервис проверки обновлений. Сеть подменяем моком
// `apiClient` (как в `test/sync-auth.test.js`), БД и нативный плагин не нужны:
// свою версию тест задаёт напрямую, поэтому проверка работает без Capacitor.
//
// Что важно зафиксировать: офлайн и 404 — не ошибки (приложение офлайн-первый),
// «позже» не действует на обязательное обновление, а кэш переживает перезапуск.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { apiClient } from 'src/services/api.js'
import updateService from 'src/services/updateService.js'
import storage from 'src/utils/storage.js'
import * as liveUpdate from 'src/utils/liveUpdate.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

// Мост к плагину OTA подменяем целиком: тесты не поднимают Capacitor и устройство
// (как и с установщиком APK — он проверяется живым прогоном, а не юнит-тестом).
vi.mock('src/utils/liveUpdate.js', () => ({
  isLiveUpdateSupported: vi.fn(() => false),
  hasLiveUpdatePlugin: vi.fn(async () => false),
  getCurrentBundleId: vi.fn(async () => null),
  ready: vi.fn(async () => true),
  downloadBundle: vi.fn(async () => ({})),
  setNextBundle: vi.fn(async () => undefined),
  reloadApplication: vi.fn(async () => undefined),
  reset: vi.fn(async () => undefined),
}))

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

/** Релиз «только веб-слой»: APK тот же, но есть бандл (Фаза 15). */
const BUNDLE = {
  version: '7',
  url: 'https://example.test/api/download-bundle?version=7',
  checksum: 'q2FzZWNoZWNrc3Vt',
  sizeBytes: 2048,
  minNativeVersionCode: 2,
  notes: 'Правки интерфейса',
}

const STORAGE_KEYS = [
  'update_release',
  'update_checked_at',
  'update_dismissed_version_code',
  'update_current_version',
  'update_pending_version_code',
  'update_current_bundle',
  'update_pending_bundle',
  'update_pending_bundle_for_native',
  'update_dismissed_bundle',
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
    currentBundleId: null,
    bundleAvailable: false,
    bundleDismissed: false,
    bundleReady: false,
    pendingBundle: null,
    downloadingBundle: false,
    bundleProgress: 0,
  }

  updateService._listeners = new Set()
  // Свою версию задаём заранее: иначе сервис пойдёт в нативный плагин.
  updateService._currentPromise = Promise.resolve({ ...current })
  // OTA: сбрасываем «плагин уже ответил» и «ready() уже повторяли».
  updateService._bundleResolved = false
  updateService._readyRetried = false
  updateService._readyConfirmed = false
}

/** Релиз, где APK тот же, а бандл свежий — типичный случай «правок интерфейса». */
function bundleRelease(extra = {}, bundleExtra = {}) {
  return { ...RELEASE, versionCode: 2, versionName: '1.1', ...extra, bundle: { ...BUNDLE, ...bundleExtra } }
}

/** Поведение плагина OTA по умолчанию: «приложение, плагин есть, бандла нет». */
function resetLiveUpdate({ supported = true, plugin = true, currentBundle = null } = {}) {
  liveUpdate.isLiveUpdateSupported.mockReturnValue(supported)
  liveUpdate.hasLiveUpdatePlugin.mockResolvedValue(plugin)
  liveUpdate.getCurrentBundleId.mockResolvedValue(currentBundle)
  liveUpdate.ready.mockResolvedValue(true)
  liveUpdate.downloadBundle.mockResolvedValue({})
  liveUpdate.setNextBundle.mockResolvedValue(undefined)
  liveUpdate.reloadApplication.mockResolvedValue(undefined)
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
  resetLiveUpdate()
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
    // Ответа не было — вот теперь честно показываем «нет интернета».
    expect(status.online).toBe(false)
  })

  it('залипший офлайн-флаг не мешает проверке: запрос всё равно уходит (14.11)', async () => {
    const spy = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: RELEASE })

    if (!setOnline(false)) return // окружение не даёт подменить navigator.onLine

    // Раньше проверка выходила до запроса — даже по кнопке «Проверить обновление»,
    // потому что `force` обходил только шестичасовую паузу. Теперь состояние сети
    // определяется результатом запроса, а не флагом WebView.
    const status = await updateService.check({ force: true })

    expect(spy).toHaveBeenCalledWith('/app-version')
    expect(status).toMatchObject({ online: true, error: null, available: true })
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

describe('15.x OTA веб-слоя: обновление без установки', () => {
  it('манифест с бандлом: устанавливать APK не нужно, а обновление есть', async () => {
    resetLiveUpdate()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })

    const status = await updateService.check({ force: true })

    expect(status.available).toBe(false) // APK тот же
    expect(status.bundleAvailable).toBe(true) // а веб-слой свежий
    expect(status.release.bundle).toMatchObject({ version: '7', checksum: BUNDLE.checksum })
  })

  it('бандл под более новый APK не предлагаем: сначала установка', async () => {
    resetLiveUpdate()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease({}, { minNativeVersionCode: 9 }) })

    expect((await updateService.check({ force: true })).bundleAvailable).toBe(false)
  })

  it('скачивание: плагин получает ссылку, хэш и прогресс, баннер гаснет', async () => {
    resetLiveUpdate()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })
    await updateService.check({ force: true })

    let onProgress = null

    liveUpdate.downloadBundle.mockImplementation(async options => {
      onProgress = options.onProgress
      options.onProgress?.(0.42)

      return {}
    })

    await updateService.downloadAndApplyBundle()

    expect(liveUpdate.downloadBundle).toHaveBeenCalledWith(
      expect.objectContaining({ url: BUNDLE.url, bundleId: '7', checksum: BUNDLE.checksum })
    )
    expect(liveUpdate.setNextBundle).toHaveBeenCalledWith('7')
    expect(onProgress).toBeTypeOf('function')

    const status = updateService.getStatus()

    expect(status.bundleReady).toBe(true) // ждёт перезапуска
    expect(status.bundleAvailable).toBe(false) // звать обновляться снова не нужно
    expect(status.downloadingBundle).toBe(false)
    expect(storage.getItem('update_pending_bundle')).toBe('7')
  })

  it('прогресс скачивания виден в состоянии', async () => {
    resetLiveUpdate()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })
    await updateService.check({ force: true })

    liveUpdate.downloadBundle.mockImplementation(async options => {
      options.onProgress?.(0.42)

      return {}
    })

    const seen = []
    updateService.subscribe(status => seen.push(status.bundleProgress))
    await updateService.downloadAndApplyBundle()

    expect(seen).toContain(42)
  })

  it('«перезапустить сейчас» применяет бандл немедленно', async () => {
    resetLiveUpdate()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })
    await updateService.check({ force: true })

    await updateService.downloadAndApplyBundle({ reload: true })

    expect(liveUpdate.reloadApplication).toHaveBeenCalled()
  })

  it('битая загрузка не оставляет «идёт загрузка» и не назначает бандл', async () => {
    resetLiveUpdate()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })
    await updateService.check({ force: true })

    liveUpdate.downloadBundle.mockRejectedValue(new Error('Файл обновления скачался с ошибкой'))

    await expect(updateService.downloadAndApplyBundle()).rejects.toThrow('скачался с ошибкой')

    const status = updateService.getStatus()

    expect(status.downloadingBundle).toBe(false)
    expect(status.bundleReady).toBe(false)
    expect(liveUpdate.setNextBundle).not.toHaveBeenCalled()
  })

  it('после перезапуска сообщение «обновление применено» показывается один раз', () => {
    resetLiveUpdate()
    storage.setItem('update_pending_bundle', '7')

    updateService.restore()

    // Пока бандл не стал текущим — сообщать нечего.
    expect(updateService.consumeAppliedBundle()).toBeNull()

    updateService._apply({ currentBundleId: '7' })

    expect(updateService.consumeAppliedBundle()).toBe('7')
    expect(updateService.consumeAppliedBundle()).toBeNull()
    expect(storage.getItem('update_pending_bundle')).toBeNull()
  })

  it('«позже» на OTA хранится отдельно от «позже» на APK', async () => {
    resetLiveUpdate()
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })
    await updateService.check({ force: true })

    const status = updateService.dismiss()

    expect(status.bundleDismissed).toBe(true)
    expect(status.dismissed).toBe(false) // нативное «позже» не тронуто
    expect(storage.getItem('update_dismissed_bundle')).toBe('7')

    // «Проверить обновление» сбрасывает оба «позже».
    expect(updateService.clearDismiss().bundleDismissed).toBe(false)
  })

  it('наличие плагина и «мы уже на этом бандле» определяются честно', async () => {
    resetLiveUpdate({ currentBundle: '7', plugin: true })

    expect(await updateService.canApplyBundle()).toBe(true)

    resetLiveUpdate({ plugin: false })

    expect(await updateService.canApplyBundle()).toBe(false)
  })

  it('свой бандл уже применён → обновления нет', async () => {
    resetLiveUpdate({ currentBundle: '7' })
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })

    expect(await updateService.loadCurrentBundle()).toBe('7')
    expect((await updateService.check({ force: true })).bundleAvailable).toBe(false)
  })
})

// Дефект живой сборки 1.9 (15.09.2026): в boot-файле стоял `await` на вызовах плагина,
// а Quasar ждёт boot-файлы **перед** монтированием приложения — молчащий плагин дал
// чёрный экран. Эти тесты держат правило «старт не зависит от плагина».
describe('15.x дефект 1.9: чёрный экран и защита старта', () => {
  it('startBundleSupport() не ждёт плагин: молчащий плагин не мешает приложению', () => {
    resetLiveUpdate({ supported: true })

    // Плагин «молчит»: ни `ready()`, ни текущий бандл не отвечают никогда.
    liveUpdate.ready.mockImplementation(() => new Promise(() => {}))
    liveUpdate.getCurrentBundleId.mockImplementation(() => new Promise(() => {}))

    expect(updateService.startBundleSupport()).toBeUndefined()
    expect(liveUpdate.ready).toHaveBeenCalled()
    expect(liveUpdate.getCurrentBundleId).toHaveBeenCalled()
    expect(updateService.getStatus()).toMatchObject({
      currentBundleId: null,
      bundleAvailable: false,
      bundleReady: false,
    })
  })

  it('boot-цепочка осталась как в рабочей 1.8: OTA-старта в ней нет', () => {
    const config = read('quasar.config.js')
    const bootList = config.slice(config.indexOf('boot: ['), config.indexOf('boot: [') + 400)

    // Дефект 1.9: OTA-инициализация стояла boot-файлом, и её `await` держал монтирование.
    expect(bootList).not.toContain('liveUpdate')
    expect(() => read('src/boot/liveUpdate.js')).toThrow()
    // Инициализация OTA теперь после монтирования — из баннера (через стор).
    expect(read('src/stores/useUpdateStore.js')).toContain('updateService.startBundleSupport()')
  })

  it('молчащий плагин на ready() не роняет сервис (и повтор ровно один)', async () => {
    resetLiveUpdate({ supported: true })
    liveUpdate.ready.mockRejectedValue(new Error('ready: плагин OTA не ответил за 3000 мс'))

    expect(await updateService.markBundleReady()).toBe(false)
    expect(await updateService.markBundleReady()).toBe(false)
    expect(liveUpdate.ready).toHaveBeenCalledTimes(2)
  })

  it('«обновление применено» приходит через состояние (баннер подпишется позже)', async () => {
    resetLiveUpdate({ supported: true, currentBundle: '7' })
    storage.setItem('update_pending_bundle', '7')

    updateService.restore()
    updateService.startBundleSupport()

    await vi.waitFor(() => expect(updateService.getStatus().appliedBundle).toBe('7'))
    expect(updateService.getStatus().pendingBundle).toBeNull()

    updateService.clearAppliedBundleNotice()
    expect(updateService.getStatus().appliedBundle).toBeNull()
  })

  it('проверка версии сама доспросит бандл, если на старте плагин молчал', async () => {
    resetLiveUpdate({ supported: true, currentBundle: '7' })
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: bundleRelease() })

    updateService._bundleResolved = false
    await updateService.check({ force: true })

    expect(liveUpdate.getCurrentBundleId).toHaveBeenCalled()
    // Мы уже на бандле 7, поэтому предлагать его снова нельзя.
    expect(updateService.getStatus().bundleAvailable).toBe(false)
  })

  it('после установки нового APK ожидание бандла снимается (15.17)', async () => {
    // 1. На APK 13 мастер скачал бандл и ещё не перезапускался.
    resetService({ current: { versionCode: 13, versionName: '1.12' } })
    resetLiveUpdate({ supported: true, currentBundle: null })
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: bundleRelease({ versionCode: 13, bundle: { ...BUNDLE, minNativeVersionCode: 13 } }),
    })

    await updateService.check({ force: true })
    await updateService.downloadAndApplyBundle()

    expect(updateService.getStatus().pendingBundle).toBe('7')
    expect(storage.getItem('update_pending_bundle_for_native')).toBe('13')

    // 2. Мастер поставил новый APK: Capacitor сбросил веб-слой на встроенный, версия выросла.
    resetService({ current: { versionCode: 14, versionName: '1.13' } })
    resetLiveUpdate({ supported: true, currentBundle: null })
    updateService.restore()

    expect(updateService.getStatus().pendingBundle).toBe('7')

    await updateService.loadCurrentBundle()

    expect(updateService.getStatus().pendingBundle).toBeNull()
    expect(storage.getItem('update_pending_bundle')).toBeNull()
    expect(storage.getItem('update_pending_bundle_for_native')).toBeNull()
    // Чипа «обновление после перезапуска» больше нет.
    expect(updateService.getStatus().bundleReady).toBe(false)
  })

  it('тот же APK: ожидание бандла остаётся живым', async () => {
    resetService({ current: { versionCode: 13, versionName: '1.12' } })
    resetLiveUpdate({ supported: true, currentBundle: null })
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: bundleRelease({ versionCode: 13, bundle: { ...BUNDLE, minNativeVersionCode: 13 } }),
    })

    await updateService.check({ force: true })
    await updateService.downloadAndApplyBundle()
    await updateService.loadCurrentBundle()

    expect(updateService.getStatus().pendingBundle).toBe('7')
    expect(storage.getItem('update_pending_bundle')).toBe('7')
  })
})
