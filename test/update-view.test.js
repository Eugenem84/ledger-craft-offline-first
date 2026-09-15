// test/update-view.test.js
//
// Фаза 13, задача 13.6: представление состояния обновления — чистая функция
// `src/utils/appUpdateView.js`. Проверяем сравнение версий (versionCode важнее
// строки), обязательность обновления и приоритеты баннера: обязательное важнее
// «позже», ошибка фоновой проверки баннер не показывает.
import { describe, it, expect } from 'vitest'
import {
  appUpdateStatusText,
  appUpdateView,
  compareVersionNames,
  formatBytes,
  isBundleUpdateAvailable,
  isUpdateAvailable,
  isUpdateMandatory,
  parseBundleVersion,
  parseVersionCode,
} from 'src/utils/appUpdateView.js'

const release = extra => ({
  versionCode: 3,
  versionName: '1.2',
  mandatory: false,
  minSupportedVersionCode: 0,
  ...extra,
})

describe('13.6 сравнение версий', () => {
  it('versionCode читается числом, мусор и ноль — «неизвестно»', () => {
    expect(parseVersionCode('12')).toBe(12)
    expect(parseVersionCode(12)).toBe(12)
    expect(parseVersionCode('12.0')).toBe(12)
    expect(parseVersionCode('abc')).toBeNull()
    expect(parseVersionCode('')).toBeNull()
    expect(parseVersionCode(null)).toBeNull()
    expect(parseVersionCode('0')).toBeNull()
  })

  it('versionName сравнивается построчно, а не как строка', () => {
    expect(compareVersionNames('1.10', '1.9')).toBe(1)
    expect(compareVersionNames('1.9', '1.10')).toBe(-1)
    expect(compareVersionNames('1.2', '1.2')).toBe(0)
    expect(compareVersionNames('1.0.1', '1.0')).toBe(1)
    expect(compareVersionNames('2', '1.9.9')).toBe(1)
  })

  it('обновление ищется по versionCode', () => {
    expect(isUpdateAvailable({ currentVersionCode: 2, release: release() })).toBe(true)
    expect(isUpdateAvailable({ currentVersionCode: 3, release: release() })).toBe(false)
    expect(isUpdateAvailable({ currentVersionCode: 4, release: release() })).toBe(false)
  })

  it('без versionCode (легаси-ответ) сравниваем versionName', () => {
    const legacy = release({ versionCode: null, versionName: '1.2' })

    expect(
      isUpdateAvailable({ currentVersionCode: null, currentVersionName: '1.1', release: legacy })
    ).toBe(true)
    expect(
      isUpdateAvailable({ currentVersionCode: null, currentVersionName: '1.2', release: legacy })
    ).toBe(false)
  })

  it('обязательность: флаг релиза или версия ниже минимально поддерживаемой', () => {
    expect(isUpdateMandatory({ currentVersionCode: 2, release: release({ mandatory: true }) })).toBe(true)
    expect(isUpdateMandatory({ currentVersionCode: 2, release: release({ minSupportedVersionCode: 3 }) })).toBe(true)
    expect(isUpdateMandatory({ currentVersionCode: 3, release: release({ minSupportedVersionCode: 3 }) })).toBe(false)
    expect(isUpdateMandatory({ currentVersionCode: 2, release: null })).toBe(false)
  })
})

describe('13.6 баннер обновления и текст статуса', () => {
  it('обязательное обновление видно и не откладывается', () => {
    const view = appUpdateView({ release: release({ mandatory: true }), available: true, mandatory: true, dismissed: true })

    expect(view).toMatchObject({ visible: true, kind: 'mandatory', canDismiss: false })
    expect(view.label).toContain('1.2')
  })

  it('необязательное обновление можно отложить', () => {
    const view = appUpdateView({ release: release(), available: true, dismissed: false })

    expect(view).toMatchObject({ visible: true, kind: 'optional', canDismiss: true })
  })

  it('«позже» скрывает баннер, пока не появится следующий релиз', () => {
    expect(appUpdateView({ release: release(), available: true, dismissed: true }).visible).toBe(false)
  })

  it('когда обновления нет — баннера нет', () => {
    expect(appUpdateView({ release: release(), available: false }).visible).toBe(false)
    expect(appUpdateView({}).visible).toBe(false)
  })

  it('ошибка и офлайн фоновой проверки баннер не показывают', () => {
    expect(appUpdateView({ error: 'Network Error' }).visible).toBe(false)
    expect(appUpdateView({ online: false }).visible).toBe(false)
    expect(appUpdateView({ checking: true })).toMatchObject({ visible: false, kind: 'checking' })
  })

  it('текст для настроек объясняет любое состояние', () => {
    expect(appUpdateStatusText({ checking: true })).toContain('Проверяем')
    expect(appUpdateStatusText({ error: 'Network Error' })).toContain('Не удалось')
    expect(appUpdateStatusText({ online: false })).toContain('Нет интернета')
    expect(appUpdateStatusText({ available: true, release: release() })).toContain('Доступна версия 1.2')
    expect(appUpdateStatusText({ available: true, mandatory: true, release: release() })).toContain('Требуется')
    expect(appUpdateStatusText({ lastCheckedAt: 1 })).toContain('последняя версия')
    expect(appUpdateStatusText({})).toContain('ещё не проверялись')
  })

  it('размер файла читается человеком', () => {
    expect(formatBytes(0)).toBe('')
    expect(formatBytes(512 * 1024)).toBe('512 КБ')
    expect(formatBytes(12.3 * 1024 * 1024)).toBe('12,3 МБ')
  })
})

describe('15.x OTA веб-слоя: бандл вместо установки', () => {
  const bundle = extra => ({
    version: '7',
    url: 'https://example.test/api/download-bundle?version=7',
    checksum: 'q2FzZWNoZWNrc3Vt',
    sizeBytes: 2048,
    minNativeVersionCode: 9,
    notes: 'Правки интерфейса',
    ...extra,
  })

  it('версия бандла — непустая строка, иначе «неизвестно»', () => {
    expect(parseBundleVersion('7')).toBe('7')
    expect(parseBundleVersion(' 7 ')).toBe('7')
    expect(parseBundleVersion('')).toBeNull()
    expect(parseBundleVersion(null)).toBeNull()
  })

  it('обновление есть, пока работаем не на этом бандле', () => {
    const args = { bundle: bundle(), currentVersionCode: 9 }

    expect(isBundleUpdateAvailable({ ...args, currentBundleId: null })).toBe(true)
    expect(isBundleUpdateAvailable({ ...args, currentBundleId: '6' })).toBe(true)
    expect(isBundleUpdateAvailable({ ...args, currentBundleId: '7' })).toBe(false)
  })

  it('без ссылки или без версии бандл не предлагаем', () => {
    expect(isBundleUpdateAvailable({ bundle: bundle({ url: null }), currentVersionCode: 9 })).toBe(false)
    expect(isBundleUpdateAvailable({ bundle: null, currentVersionCode: 9 })).toBe(false)
  })

  it('бандл под более новый APK молчит: сначала установка APK', () => {
    expect(
      isBundleUpdateAvailable({
        currentBundleId: null,
        bundle: bundle({ minNativeVersionCode: 10 }),
        currentVersionCode: 9,
      })
    ).toBe(false)
  })

  it('бандл, собранный под старый APK, не предлагаем — иначе откатим веб-слой (15.16)', () => {
    const args = { currentBundleId: null, currentVersionCode: 14 }

    // Бандл собран для 13, а установлен 14: встроенный веб-слой APK не старее.
    expect(isBundleUpdateAvailable({ ...args, bundle: bundle({ minNativeVersionCode: 13 }) })).toBe(false)
    // Тот же код — нормально: бандл собран для этой сборки.
    expect(isBundleUpdateAvailable({ ...args, bundle: bundle({ minNativeVersionCode: 14 }) })).toBe(true)
    // Ноль/пусто = «ограничения нет» (так публиковали до появления конвенции).
    expect(isBundleUpdateAvailable({ ...args, bundle: bundle({ minNativeVersionCode: 0 }) })).toBe(true)
    expect(isBundleUpdateAvailable({ ...args, bundle: bundle({ minNativeVersionCode: null }) })).toBe(true)
  })

  it('чип «обновление без установки» виден и откладывается', () => {
    const view = appUpdateView({
      release: release({ bundle: bundle() }),
      available: false,
      bundleAvailable: true,
    })

    expect(view).toMatchObject({ visible: true, kind: 'ota', color: 'secondary', canDismiss: true })

    expect(
      appUpdateView({
        release: release({ bundle: bundle() }),
        available: false,
        bundleAvailable: true,
        bundleDismissed: true,
      }).visible
    ).toBe(false)
  })

  it('скачанный бандл: чип зовёт перезапуститься и не откладывается', () => {
    const view = appUpdateView({
      release: release({ bundle: bundle() }),
      available: false,
      bundleReady: true,
    })

    expect(view).toMatchObject({ visible: true, kind: 'ota_ready', canDismiss: false })
  })

  it('нативное обновление важнее OTA (новый APK приносит и новый веб-слой)', () => {
    const view = appUpdateView({
      release: release({ bundle: bundle(), mandatory: true }),
      available: true,
      mandatory: true,
      bundleAvailable: true,
      bundleReady: false,
    })

    expect(view.kind).toBe('mandatory')
  })

  it('текст статуса объясняет OTA простыми словами', () => {
    expect(appUpdateStatusText({ bundleAvailable: true })).toContain('без установки')
    expect(appUpdateStatusText({ bundleReady: true })).toContain('после перезапуска')
  })
})
