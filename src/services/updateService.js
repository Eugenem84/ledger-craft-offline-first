// src/services/updateService.js
//
// Проверка обновлений Android-приложения (Фаза 13, задачи 13.5/13.7 и 13.12).
//
// Устроено как у синка (`syncService.js`): сервис-singleton с подпиской и
// неблокирующим фоновым запуском. Приложение работает офлайн, поэтому проверка
// версии — это «фоновая роскошь»: она никогда не блокирует старт, при отсутствии
// сети просто молчит, а ошибки не показываются поверх работы мастерской.
//
// Что делает сервис:
//   • знает СВОЮ версию: `versionCode` (число — именно его сравнивает Android) и
//     `versionName` (`@capacitor/app` на устройстве, кэш — в браузере);
//   • спрашивает сервер (`GET /app-version`) и решает, есть ли обновление
//     (`src/utils/appUpdateView.js` — чистая логика, покрыта тестами);
//   • помнит «напомнить позже» (по версии релиза) и время последней проверки;
//   • качает APK с прогрессом и передаёт его нативному установщику
//     (`ApkInstaller`, задача 13.11), сверяя sha256 из манифеста релиза;
//   • **обновляет веб-слой по воздуху** (Фаза 15): если в манифесте есть бандл
//     (`release.bundle`), скачивает его плагином OTA, проверяет хэш и применяет при
//     следующем запуске — без установки APK и без системного диалога.
//
// Два вида обновления в одном сервисе — не дублирование, а выбор по «физике»:
//   • новее `versionCode` → нативный путь (APK + установщик): меняется нативная часть;
//   • тот же APK, но новее бандл → OTA: меняется только JS/CSS/HTML.
// Нативное важнее: новый APK приносит и новый веб-слой.
import { apiClient } from 'src/services/api.js'
import storage from 'src/utils/storage.js'
import { logger } from 'src/utils/logger.js'
import { isNativePlatform } from 'src/utils/platform.js'
import {
  isBundleUpdateAvailable,
  isUpdateAvailable,
  isUpdateMandatory,
  parseBundleVersion,
  parseVersionCode,
} from 'src/utils/appUpdateView.js'
import {
  downloadBundle,
  getAppVersionCode,
  getAppVersionName,
  getCurrentBundleId,
  hasLiveUpdatePlugin,
  isLiveUpdateSupported,
  ready as markPluginReady,
  reloadApplication,
  setNextBundle,
} from 'src/utils/liveUpdate.js'
import { withTimeout } from 'src/utils/async.js'

// Кэш последнего ответа сервера и своих версий: с ним баннер знает состояние ещё
// до ответа нативной части (мгновенный старт, работа без сети).
const RELEASE_KEY = 'update_release'
const CHECKED_AT_KEY = 'update_checked_at'
const DISMISSED_KEY = 'update_dismissed_version_code'
const CURRENT_KEY = 'update_current_version'

// OTA веб-слоя (Фаза 15): какой бандл работает сейчас, какой скачан и что отложено.
const CURRENT_BUNDLE_KEY = 'update_current_bundle'
const PENDING_BUNDLE_KEY = 'update_pending_bundle'
// С каким `versionCode` APK бандл скачали: после установки нового APK ожидание снимается
// (Capacitor сбрасывает веб-слой на встроенный, задача 15.17).
const PENDING_BUNDLE_FOR_KEY = 'update_pending_bundle_for_native'
const DISMISSED_BUNDLE_KEY = 'update_dismissed_bundle'

// Задача установки записывается перед передачей APK установщику: после установки
// Android убивает процесс, и «обновление установлено» показываем при следующем старте.
const PENDING_KEY = 'update_pending_version_code'

// Фоновая проверка — раз в 6 часов, плюс сразу при возвращении сети.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

// Первую проверку откладываем: не конкурируем со стартом синка и отрисовкой.
const FIRST_CHECK_DELAY_MS = 4000

// Повтор «бандл рабочий»: на старте связка JS↔native может быть ещё не готова.
const READY_RETRY_DELAY_MS = 5000

class UpdateService {
  constructor() {
    this.status = {
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
      // --- OTA веб-слоя (Фаза 15) -------------------------------------------
      /** Бандл, на котором работает приложение; `null` — встроенный (из APK). */
      currentBundleId: null,
      /** Есть свежий бандл под этот APK (решает `isBundleUpdateAvailable`). */
      bundleAvailable: false,
      bundleDismissed: false,
      /** Бандл скачан и назначен: применится при следующем запуске. */
      bundleReady: false,
      /** Версия бандла, скачанного и ждущего перезапуска (для сообщений). */
      pendingBundle: null,
      downloadingBundle: false,
      bundleProgress: 0,
      /**
       * Разовое сообщение «обновление без установки применено» (после перезапуска).
       * Живёт в состоянии, а не в разовом вызове: баннер подписывается позже, чем
       * плагин отвечает, и может не успеть «съесть» одноразовое значение.
       */
      appliedBundle: null,
    }

    this._listeners = new Set()
    this._currentPromise = null
    this._firstTimer = null
    this._timer = null
    this._onlineHandler = null
    // Подписка на «возврат в приложение» — идемпотентна (см. startAutoCheck).
    this._resumeBound = false
    // OTA (Фаза 15): плагин уже ответил про свой бандл / `ready()` уже повторяли.
    this._bundleResolved = false
    this._readyRetried = false
    this._readyConfirmed = false
  }

  /** Снимок состояния для UI (копия — наружу не отдаём внутренний объект). */
  getStatus() {
    return { ...this.status, current: { ...this.status.current } }
  }

  /** Подписка на изменения: возвращает функцию отписки. */
  subscribe(listener) {
    this._listeners.add(listener)

    return () => this._listeners.delete(listener)
  }

  _emit() {
    for (const listener of [...this._listeners]) {
      try {
        listener(this.getStatus())
      } catch (error) {
        console.error('[Update] Ошибка подписчика:', error)
      }
    }
  }

  /** Обновляет состояние, пересчитывает производные флаги и уведомляет подписчиков. */
  _apply(patch = {}) {
    this.status = { ...this.status, ...patch }
    this._recomputeDerived()
    this._emit()

    return this.getStatus()
  }

  /**
   * Производные признаки: «есть обновление», «обязательно», «отложено».
   * Считаются из текущей версии, релиза и памяти о «позже» — поэтому логику
   * сравнения версий проверяем отдельным тестом, а не здесь.
   */
  _recomputeDerived() {
    const { current, release } = this.status
    const available = isUpdateAvailable({
      currentVersionCode: current.versionCode,
      currentVersionName: current.versionName,
      release,
    })

    this.status.available = available
    this.status.mandatory = isUpdateMandatory({
      currentVersionCode: current.versionCode,
      release,
    })

    const key = this._releaseKey(release)

    this.status.dismissed =
      available && key !== null && storage.getItem(DISMISSED_KEY) === String(key)

    // --- OTA веб-слоя (Фаза 15) ---------------------------------------------
    // «Уже на этом бандле» — это либо применённый бандл (`currentBundleId`), либо
    // скачанный и ждущий перезапуска (`pendingBundle`): второй случай нужен, чтобы
    // после нажатия «Обновить» баннер не звал обновляться снова.
    const bundle = release?.bundle || null
    const bundleVersion = parseBundleVersion(bundle?.version)
    const pending = parseBundleVersion(this.status.pendingBundle)

    this.status.bundleReady =
      bundleVersion !== null &&
      pending !== null &&
      bundleVersion === pending &&
      parseBundleVersion(this.status.currentBundleId) !== pending

    this.status.bundleAvailable = isBundleUpdateAvailable({
      currentBundleId: this.status.currentBundleId || this.status.pendingBundle,
      bundle,
      currentVersionCode: current.versionCode,
    })

    this.status.bundleDismissed =
      this.status.bundleAvailable &&
      bundleVersion !== null &&
      storage.getItem(DISMISSED_BUNDLE_KEY) === bundleVersion
  }

  /** Ключ релиза для «напомнить позже»: versionCode, а без него — versionName. */
  _releaseKey(release) {
    if (!release) return null

    const key = release.versionCode ?? release.versionName

    return key === null || key === undefined || key === '' ? null : String(key)
  }

  _readJson(key) {
    const raw = storage.getItem(key)

    if (!raw) return null

    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  /** Поднимает кэш (релиз, время проверки, свои версии) — вызывается на старте. */
  restore() {
    const cachedAt = Number.parseInt(storage.getItem(CHECKED_AT_KEY) ?? '', 10)
    const current = this._readJson(CURRENT_KEY)

    return this._apply({
      release: this._readJson(RELEASE_KEY),
      lastCheckedAt: Number.isFinite(cachedAt) ? cachedAt : 0,
      current: current && typeof current === 'object' ? current : this.status.current,
      currentBundleId: parseBundleVersion(storage.getItem(CURRENT_BUNDLE_KEY)),
      pendingBundle: parseBundleVersion(storage.getItem(PENDING_BUNDLE_KEY)),
    })
  }

  /**
   * Своя версия приложения: `versionCode` (число — именно его сравнивает Android)
   * и `versionName` (подпись для человека).
   *
   * ⚠️ Здесь **два** нативных источника, и это не дублирование: `@capacitor/app` —
   * единственная точка отказа, а единственный источник умеет ломаться тихо (живой
   * дефект: на Android «версия неизвестна», хотя веб-сборка показывала значение).
   * Порядок: `App.getInfo()` → плагин OTA (`getVersionCode`/`getVersionName` — другой
   * Java-путь к тому же `PackageInfo`) → кэш последнего удачного чтения.
   *
   * Провал **не запоминается**: следующий вызов и кнопка «Проверить обновление»
   * пробуют снова, а причина (`warn`) уезжает в постоянный буфер ошибок и в отчёт
   * «Сообщить об ошибке».
   *
   * @param {{force?: boolean}} [options] `force` — перечитать, даже если значение уже читали
   */
  async loadCurrentVersion({ force = false } = {}) {
    if (!force && this._currentPromise) return this._currentPromise

    const promise = this._readCurrentVersion()

    this._currentPromise = promise

    return promise
  }

  /** Перечитать версию принудительно (кнопка «Проверить обновление»). */
  async refreshCurrentVersion() {
    return this.loadCurrentVersion({ force: true })
  }

  /** Одно чтение версии: два нативных источника и кэш. Никогда не бросает. */
  async _readCurrentVersion() {
    const cached = this._readJson(CURRENT_KEY)

    if (!isNativePlatform()) {
      // Веб-сборка: нативной версии нет — показываем последнее известное.
      return cached || { versionCode: null, versionName: null }
    }

    const fromAppPlugin = await this._readVersionFromAppPlugin()

    if (fromAppPlugin !== null) return this._rememberVersion(fromAppPlugin)

    const fromLiveUpdate = await this._readVersionFromLiveUpdate()

    if (fromLiveUpdate !== null) {
      logger.warn(
        `[Update] версию приложения отдал плагин OTA (${fromLiveUpdate.versionName ?? '—'} / ` +
          `${fromLiveUpdate.versionCode ?? '—'}): @capacitor/app её не вернул`
      )

      return this._rememberVersion(fromLiveUpdate)
    }

    logger.warn('[Update] версию приложения не отдал ни один источник — показываем «неизвестна»')

    return cached || { versionCode: null, versionName: null }
  }

  /** Источник 1: `@capacitor/app` (`build` — это `versionCode`). */
  async _readVersionFromAppPlugin() {
    try {
      // Динамический импорт: в браузере и в тестах (Node) этот код не выполняется,
      // поэтому модуль плагина не тянется в веб-сборку и не ломает тесты.
      const { App } = await import('@capacitor/app')
      const info = await withTimeout(App.getInfo(), 'App.getInfo()')
      const current = {
        versionCode: parseVersionCode(info?.build),
        versionName: info?.version ? String(info.version) : null,
      }

      if (current.versionCode === null && current.versionName === null) {
        logger.warn('[Update] App.getInfo() ответил пустыми данными:', JSON.stringify(info ?? null))

        return null
      }

      return current
    } catch (error) {
      logger.warn('[Update] App.getInfo() не сработал:', error?.message || error)

      return null
    }
  }

  /** Источник 2: плагин OTA — `getVersionCode()`/`getVersionName()`. */
  async _readVersionFromLiveUpdate() {
    if (!isLiveUpdateSupported()) return null

    try {
      const code = await getAppVersionCode()
      const name = await getAppVersionName()
      const current = {
        versionCode: parseVersionCode(code),
        versionName: name ? String(name) : null,
      }

      return current.versionCode === null && current.versionName === null ? null : current
    } catch (error) {
      logger.warn('[Update] плагин OTA не отдал версию приложения:', error?.message || error)

      return null
    }
  }

  /** Запоминаем удачное чтение: оно переживёт перезапуск и покажется до сети. */
  _rememberVersion(current) {
    storage.trySetItem(CURRENT_KEY, JSON.stringify(current))

    return current
  }

  /** Проверка обновления. По умолчанию — не чаще раза в 6 часов (`force` обходит). */
  async check({ force = false } = {}) {
    if (this.status.checking) return this.getStatus()
    if (!force && this._isFresh()) return this.getStatus()

    const current = await this.loadCurrentVersion()

    // OTA (Фаза 15): если на старте плагин не успел ответить, спросим ещё раз здесь —
    // проверка версии и так фоновая, приложению ждать не мешает.
    if (isLiveUpdateSupported() && !this._bundleResolved) {
      await this.loadCurrentBundle()
    }

    // И то же про `ready()`: баннер мог не смонтироваться, а без подтверждения плагин
    // откатывает настоящий бандл. Вызов — фоном, проверку версии не задерживает.
    if (isLiveUpdateSupported() && !this._readyConfirmed) {
      void this.markBundleReady()
    }

    this._apply({ current, checking: true, error: null })

    // ⚠️ Никакого «офлайн — не идём в сеть» здесь больше нет (дефект 14.11).
    //
    // `navigator.onLine` в Android WebView умеет залипать в `false` (после обновления
    // приложения или смены сети событие `online` до приостановленного WebView не доходит),
    // и тогда проверка версии не делала запрос **вообще** — даже по кнопке «Проверить
    // обновление», потому что `force` обходил только паузу между проверками. Состояние
    // «нет интернета» теперь выводим из реального результата запроса (см. catch ниже):
    // ответа нет → сеть недоступна, ответ есть (в т.ч. 5xx) → сеть есть.
    try {
      const { data } = await apiClient.get('/app-version')
      const release = this._normalizeRelease(data)
      const now = Date.now()

      storage.trySetItem(RELEASE_KEY, JSON.stringify(release))
      storage.trySetItem(CHECKED_AT_KEY, String(now))

      return this._apply({
        checking: false,
        online: true,
        error: null,
        release,
        lastCheckedAt: now,
      })
    } catch (error) {
      const status = error?.response?.status ?? null

      // 404 — просто «ничего не опубликовано»: это не ошибка связи.
      if (status === 404) {
        return this._apply({ checking: false, online: true, error: null, release: null })
      }

      logger.log('[Update] проверка версии не удалась:', error?.message || error)

      return this._apply({
        checking: false,
        online: status !== null,
        error: error?.message || 'network',
      })
    }
  }

  /**
   * «Напомнить позже».
   *
   * Нативное обновление откладывается по `versionCode` релиза (и не откладывается,
   * если оно обязательное), OTA-обновление — по версии бандла: версии разные, и
   * «позже» на одно не должно скрывать другое.
   */
  dismiss() {
    const release = this.status.release
    const key = this._releaseKey(release)
    const bundleVersion = parseBundleVersion(release?.bundle?.version)

    if (this.status.available === true && this.status.mandatory !== true && key !== null) {
      storage.trySetItem(DISMISSED_KEY, String(key))
    } else if (this.status.bundleAvailable === true && bundleVersion !== null) {
      storage.trySetItem(DISMISSED_BUNDLE_KEY, bundleVersion)
    }

    return this._apply()
  }

  /** Сбрасывает «позже» — кнопка «Проверить обновление» в настройках. */
  clearDismiss() {
    storage.removeItem(DISMISSED_KEY)
    storage.removeItem(DISMISSED_BUNDLE_KEY)

    return this._apply()
  }

  _isFresh() {
    return this.status.lastCheckedAt > 0 && Date.now() - this.status.lastCheckedAt < CHECK_INTERVAL_MS
  }

  /** Приводим ответ сервера к одному виду (в т.ч. легаси-ответ без `versionCode`). */
  _normalizeRelease(data) {
    if (!data || typeof data !== 'object') return null

    const bundle = this._normalizeBundle(data.bundle)

    // Релиз без версии, но с бандлом — это «обновление только веб-слоя» (15.6):
    // APK ставить не нужно, а обновление есть.
    if (!data.versionCode && !data.versionName && !data.version && !bundle) return null

    return {
      versionCode: data.versionCode ?? null,
      versionName: data.versionName ?? data.version ?? null,
      apkUrl: data.apkUrl || null,
      sha256: data.sha256 || null,
      sizeBytes: Number(data.sizeBytes) || 0,
      mandatory: data.mandatory === true,
      minSupportedVersionCode: data.minSupportedVersionCode ?? 0,
      notes: data.notes || '',
      legacy: data.legacy === true,
      bundle,
    }
  }

  /**
   * Бандл веб-слоя из манифеста релиза (Фаза 15).
   *
   * Контракт `GET /app-version` (см. `docs/API-INTEGRATION.md` §2.5):
   *   `bundle: { version, url, checksum, sizeBytes, minNativeVersionCode, notes }`
   * где `checksum` — sha256 **в base64** (именно в таком виде его ждёт плагин OTA),
   * а `minNativeVersionCode` — минимальный `versionCode` APK, на котором бандл имеет
   * смысл (страховка от «старый APK + новый JS, который зовёт новый плагин»).
   */
  _normalizeBundle(raw) {
    if (!raw || typeof raw !== 'object') return null

    const version = parseBundleVersion(raw.version ?? raw.bundleId)
    const url = raw.url || raw.downloadUrl || null

    if (version === null || !url) return null

    return {
      version,
      url,
      checksum: raw.checksum || null,
      sizeBytes: Number(raw.sizeBytes) || 0,
      minNativeVersionCode: raw.minNativeVersionCode ?? null,
      notes: raw.notes || '',
    }
  }

  /**
   * Первая проверка отложена, дальше — по таймеру, при появлении сети и при возврате
   * в приложение.
   *
   * Возврат в приложение (`visibilitychange` + нативный `appStateChange`) нужен по той же
   * причине, что и в синке: `online` до приостановленного WebView может не дойти, и без
   * перепроверки проверка версии «молчит» до перезапуска приложения (дефект 14.11).
   */
  startAutoCheck() {
    if (this._timer) return

    this._firstTimer = setTimeout(() => {
      void this.check()
    }, FIRST_CHECK_DELAY_MS)

    this._timer = setInterval(() => {
      void this.check({ force: true })
    }, CHECK_INTERVAL_MS)

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._onlineHandler = () => {
        void this.check()
      }

      window.addEventListener('online', this._onlineHandler)
    }

    if (!this._resumeBound) {
      this._resumeBound = true

      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void this.check({ force: true })
          }
        })
      }

      void this._bindNativeResume()
    }
  }

  /** Нативный resume: `App.addListener('appStateChange')` (импорт динамический). */
  async _bindNativeResume() {
    try {
      const { Capacitor } = await import('@capacitor/core')

      if (!Capacitor || typeof Capacitor.isNativePlatform !== 'function' || !Capacitor.isNativePlatform()) {
        return
      }

      const { App } = await import('@capacitor/app')

      this._nativeResumeHandle = await App.addListener('appStateChange', state => {
        if (state?.isActive) void this.check({ force: true })
      })
    } catch (error) {
      logger.warn('[Update] Не удалось подписаться на appStateChange:', error?.message || error)
    }
  }

  stopAutoCheck() {
    if (this._firstTimer) clearTimeout(this._firstTimer)
    if (this._timer) clearInterval(this._timer)

    this._firstTimer = null
    this._timer = null

    if (this._onlineHandler && typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('online', this._onlineHandler)
    }

    this._onlineHandler = null
  }

  /**
   * Фоновая инициализация OTA (Фаза 15).
   *
   * ⚠️ Вызывается **после монтирования** приложения (`useUpdateStore.bind()` из баннера),
   * а не из boot-файла: Quasar дожидается boot-файлов перед монтированием, поэтому `await`
   * на вызове нативного плагина давал чёрный экран (дефект сборки 1.9). Здесь только запуск
   * фоновых задач, ни одна из которых не блокирует интерфейс:
   *   • `ready()` — подтвердить, что бандл рабочий (иначе плагин откатит его);
   *   • текущий бандл + разовое «обновление применено».
   */
  startBundleSupport() {
    void this.markBundleReady()

    void this.loadCurrentBundle().then(() => {
      const applied = this.consumeAppliedBundle()

      if (applied !== null) this._apply({ appliedBundle: applied })
    })
  }

  /**
   * Сообщает плагину «бандл рабочий» (без этого он вернётся к встроенному по
   * `readyTimeout`). Ошибку не пробрасываем: приложение обязано стартовать.
   *
   * Если плагин не ответил (связка JS↔native ещё не готова, старая сборка без
   * плагина), пробуем ровно один раз чуть позже — тогда авто-откат настоящего
   * бандла не сработает ложно.
   */
  async markBundleReady() {
    if (!isLiveUpdateSupported()) return false

    try {
      await markPluginReady()
      this._readyConfirmed = true
      logger.log('[Update] OTA: плагин подтвердил, что бандл рабочий')

      return true
    } catch (error) {
      logger.warn('[Update] OTA: плагин не ответил на ready():', error?.message || error)

      if (!this._readyRetried) {
        this._readyRetried = true

        setTimeout(() => void this.markBundleReady(), READY_RETRY_DELAY_MS)
      }

      return false
    }
  }

  /** Снимает разовое сообщение «обновление без установки применено». */
  clearAppliedBundleNotice() {
    return this._apply({ appliedBundle: null })
  }

  // --- OTA веб-слоя (Фаза 15) --------------------------------------------------
  // Механика: баннер/диалог спрашивает «есть ли бандл под этот APK», а сервис
  // скачивает его и назначает «следующим». Перезапуск — по желанию мастера
  // (`restartNow`) либо сам при следующем запуске. Откат — на стороне плагина:
  // если бандл не позовёт `ready()` за `readyTimeout`, плагин вернётся к
  // встроенному (см. `src/utils/liveUpdate.js` и `capacitor.config.json`).

  /** На каком бандле работаем: встроенный (`null`) или скачанный ранее. */
  async loadCurrentBundle() {
    if (!isLiveUpdateSupported()) return this.status.currentBundleId

    try {
      const bundleId = await getCurrentBundleId()

      storage.trySetItem(CURRENT_BUNDLE_KEY, bundleId ?? '')

      this._bundleResolved = true

      const status = this._apply({ currentBundleId: bundleId })

      // После установки нового APK скачанный бандл больше не используется — снимаем ожидание.
      this._dropStalePendingBundle(bundleId)

      return status.currentBundleId
    } catch (error) {
      logger.log('[Update] не удалось узнать текущий бандл:', error?.message || error)

      return this.status.currentBundleId
    }
  }

  /**
   * Снимает «применится при перезапуске», если APK успел обновиться (задача 15.17).
   *
   * Capacitor при смене `versionCode`/`versionName` сам сбрасывает веб-слой на встроенный
   * (`Bridge.isNewBinary()` → `CAP_SERVER_PATH = ""`), а скачанный бандл остаётся в кэше
   * неиспользованным. Без этой проверки чип продолжал бы звать перезапуститься «в никуда»,
   * а в хранилище копилось бы ожидание бандла, которого уже нет.
   */
  _dropStalePendingBundle(currentBundleId) {
    const pending = parseBundleVersion(this.status.pendingBundle)

    if (pending === null) return false

    // Бандл уже стал текущим — этим займётся `consumeAppliedBundle()`.
    if (parseBundleVersion(currentBundleId) === pending) return false

    const nativeNow = parseVersionCode(this.status.current?.versionCode)
    const nativeWhenScheduled = parseVersionCode(storage.getItem(PENDING_BUNDLE_FOR_KEY))

    // Версию APK не знаем или она та же — ожидание живое (бандл ждёт перезапуска).
    if (nativeNow === null || nativeWhenScheduled === null || nativeNow === nativeWhenScheduled) {
      return false
    }

    storage.removeItem(PENDING_BUNDLE_KEY)
    storage.removeItem(PENDING_BUNDLE_FOR_KEY)
    this._apply({ pendingBundle: null })

    logger.log('[Update] OTA: APK обновился — ожидание бандла снято')

    return true
  }

  /** Есть ли в этой сборке APK плагин OTA (в старых сборках его нет). */
  async canApplyBundle() {
    return hasLiveUpdatePlugin()
  }

  /**
   * Скачивает OTA-бандл и назначает его следующим.
   *
   * `reload = false` (по умолчанию) — применится при следующем запуске: мастер не
   * теряет незаконченную работу. `reload = true` — кнопка «Перезапустить сейчас».
   */
  async downloadAndApplyBundle({ reload = false } = {}) {
    const bundle = this.status.release?.bundle

    if (!bundle?.url) throw new Error('Нет файла обновления для загрузки')

    this._apply({ downloadingBundle: true, bundleProgress: 0 })

    try {
      await downloadBundle({
        url: bundle.url,
        bundleId: bundle.version,
        checksum: bundle.checksum,
        onProgress: progress => this._apply({ bundleProgress: Math.round(progress * 100) }),
      })

      await setNextBundle(bundle.version)
      storage.trySetItem(PENDING_BUNDLE_KEY, bundle.version)

      // Запоминаем, с каким APK бандл скачали: если мастер поставит новый APK, Capacitor
      // сбросит веб-слой и ожидание надо снять (задача 15.17).
      const nativeCode = parseVersionCode(this.status.current?.versionCode)

      if (nativeCode !== null) storage.trySetItem(PENDING_BUNDLE_FOR_KEY, String(nativeCode))

      // `pendingBundle` убирает и баннер, и «обновление доступно»: бандл скачан и
      // ждёт перезапуска (см. `_recomputeDerived`).
      this._apply({ pendingBundle: bundle.version, bundleProgress: 100 })

      if (reload) return this.restartNow()

      return true
    } finally {
      this._apply({ downloadingBundle: false })
    }
  }

  /** Перезапуск приложения на скачанном бандле («Перезапустить сейчас»). */
  async restartNow() {
    if (!isLiveUpdateSupported()) return false

    await reloadApplication()

    return true
  }

  /**
   * «Обновление без установки применилось» — одноразовое сообщение после перезапуска
   * (как `consumeInstalledVersion` для APK). Возвращает версию бандла или `null`.
   */
  consumeAppliedBundle() {
    const pending = parseBundleVersion(this.status.pendingBundle)

    if (pending === null) return null

    // Приложение перезапустилось на скачанном бандле, только если он стал текущим.
    if (parseBundleVersion(this.status.currentBundleId) !== pending) return null

    storage.removeItem(PENDING_BUNDLE_KEY)
    storage.removeItem(PENDING_BUNDLE_FOR_KEY)
    this._apply({ pendingBundle: null })

    return pending
  }

  // --- Скачивание и установка (задачи 13.10 и 13.12) --------------------------

  /** Открывает ссылку на APK в браузере (на устройстве — Custom Tab). */
  async openDownloadPage() {
    const url = this.status.release?.apkUrl

    if (!url) return false

    if (isNativePlatform()) {
      try {
        const { Browser } = await import('@capacitor/browser')

        await Browser.open({ url })

        return true
      } catch (error) {
        logger.warn('[Update] не удалось открыть браузер:', error?.message || error)
      }
    }

    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank')

      return true
    }

    return false
  }

  /** Есть ли нативный установщик APK (свой плагин, задача 13.11). */
  async isInstallerAvailable() {
    if (!isNativePlatform()) return false

    try {
      const { ApkInstaller } = await loadApkInstaller()

      // Не просто «вызов прошёл»: пробуем `canInstall()`. В старой сборке APK
      // плагина нет — вызов отвалится, и мы честно вернём «нет установщика»
      // (тогда обновление пойдёт через браузер, см. `openDownloadPage`).
      const result = await ApkInstaller.canInstall()

      return typeof result?.granted === 'boolean'
    } catch (error) {
      logger.log('[Update] нативный установщик недоступен:', error?.message || error)

      return false
    }
  }

  /**
   * Разрешена ли установка приложений из этого источника (Android 8+).
   * Без разрешения система не покажет диалог установки, поэтому кнопка должна
   * вести на `openInstallSettings()`.
   */
  async canInstall() {
    if (!isNativePlatform()) return false

    const { ApkInstaller } = await loadApkInstaller()
    const result = await ApkInstaller.canInstall()

    return result?.granted === true
  }

  /** Системный экран «Установка неизвестных приложений» для нашего приложения. */
  async openInstallSettings() {
    if (!isNativePlatform()) return false

    const { ApkInstaller } = await loadApkInstaller()

    await ApkInstaller.openSettings()

    return true
  }

  /**
   * Скачивает APK релиза с прогрессом и передаёт установщику.
   *
   * Порядок важен: сначала файл в кэш приложения, затем сверка sha256 с манифестом
   * релиза (битый/подменённый файл не ставим), и только потом системный диалог.
   * Факт запуска установки запоминаем — Android после установки убьёт процесс.
   */
  async downloadAndInstall() {
    const release = this.status.release

    if (!release?.apkUrl) throw new Error('Нет ссылки на файл обновления')

    const { ApkInstaller } = await loadApkInstaller()
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const fileName = `ledger-craft-${release.versionCode ?? release.versionName ?? 'latest'}.apk`

    this._apply({
      downloading: true,
      downloadProgress: 0,
      downloadingVersion: release.versionCode ?? null,
    })

    let progressHandle = null

    try {
      progressHandle = await Filesystem.addListener('progress', info => {
        const total = Number(info?.totalBytes) || 0
        const loaded = Number(info?.bytes) || 0

        this._apply({
          downloadProgress: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        })
      })
    } catch (error) {
      logger.log('[Update] прогресс загрузки недоступен:', error?.message || error)
    }

    let filePath = null

    try {
      // Обрывок прошлой попытки не переиспользуем — качаем заново.
      await this._removeFileIfExists(Filesystem, Directory.Cache, fileName)

      const result = await Filesystem.downloadFile({
        url: release.apkUrl,
        path: fileName,
        directory: Directory.Cache,
        progress: true,
      })

      filePath = result?.path || fileName
    } finally {
      if (progressHandle?.remove) {
        try {
          await progressHandle.remove()
        } catch {
          // подписка могла уже отвалиться — не мешает установке
        }
      }
    }

    if (release.sha256) {
      const actual = await this._sha256OfFile(Filesystem, Directory.Cache, fileName)

      if (actual && actual.toLowerCase() !== String(release.sha256).toLowerCase()) {
        await this._removeFileIfExists(Filesystem, Directory.Cache, fileName)
        this._apply({ downloading: false, downloadProgress: 0 })

        throw new Error('Файл обновления скачался с ошибкой — попробуйте ещё раз')
      }
    }

    if (release.versionCode) {
      storage.trySetItem(PENDING_KEY, String(release.versionCode))
    }

    await ApkInstaller.install({ path: filePath })

    return this._apply({ downloading: false, downloadProgress: 100 })
  }

  /**
   * «Установку запускали, и версия выросла» — показываем сообщение один раз.
   * Возвращает установленный `versionCode` или `null`.
   */
  consumeInstalledVersion() {
    const pending = parseVersionCode(storage.getItem(PENDING_KEY))
    const current = parseVersionCode(this.status.current.versionCode)

    if (pending === null) return null

    if (current !== null && current >= pending) {
      storage.removeItem(PENDING_KEY)

      return pending
    }

    return null
  }

  async _removeFileIfExists(Filesystem, directory, path) {
    try {
      await Filesystem.deleteFile({ path, directory })
    } catch {
      // файла нет — и хорошо
    }
  }

  /** sha256 файла в hex: сверяем скачанный APK с манифестом релиза. */
  async _sha256OfFile(Filesystem, directory, path) {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null

    try {
      const { data } = await Filesystem.readFile({ path, directory })

      if (typeof data !== 'string') return null

      const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(data))

      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    } catch (error) {
      logger.warn('[Update] не удалось проверить sha256 файла:', error?.message || error)

      return null
    }
  }
}

export default new UpdateService()

// --- Вспомогательное (модульный уровень) ------------------------------------

/** base64 → Uint8Array: нужно для проверки sha256 скачанного APK. */
function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

/**
 * Нативный установщик APK (задача 13.11) — свой плагин без npm-пакета, поэтому
 * подключаем его через `registerPlugin`. Импорт динамический: на веб-платформе
 * и в тестах этот код не выполняется.
 */
async function loadApkInstaller() {
  const { registerPlugin } = await import('@capacitor/core')

  return { ApkInstaller: registerPlugin('ApkInstaller') }
}

