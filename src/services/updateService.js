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
//     (`ApkInstaller`, задача 13.11), сверяя sha256 из манифеста релиза.
import { apiClient } from 'src/services/api.js'
import storage from 'src/utils/storage.js'
import { logger } from 'src/utils/logger.js'
import { isNativePlatform } from 'src/utils/platform.js'
import { isUpdateAvailable, isUpdateMandatory, parseVersionCode } from 'src/utils/appUpdateView.js'

// Кэш последнего ответа сервера и своих версий: с ним баннер знает состояние ещё
// до ответа нативной части (мгновенный старт, работа без сети).
const RELEASE_KEY = 'update_release'
const CHECKED_AT_KEY = 'update_checked_at'
const DISMISSED_KEY = 'update_dismissed_version_code'
const CURRENT_KEY = 'update_current_version'

// Задача установки записывается перед передачей APK установщику: после установки
// Android убивает процесс, и «обновление установлено» показываем при следующем старте.
const PENDING_KEY = 'update_pending_version_code'

// Фоновая проверка — раз в 6 часов, плюс сразу при возвращении сети.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

// Первую проверку откладываем: не конкурируем со стартом синка и отрисовкой.
const FIRST_CHECK_DELAY_MS = 4000

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
    }

    this._listeners = new Set()
    this._currentPromise = null
    this._firstTimer = null
    this._timer = null
    this._onlineHandler = null
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

  _isOnline() {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true

    return navigator.onLine
  }

  /** Поднимает кэш (релиз, время проверки, свои версии) — вызывается на старте. */
  restore() {
    const cachedAt = Number.parseInt(storage.getItem(CHECKED_AT_KEY) ?? '', 10)
    const current = this._readJson(CURRENT_KEY)

    return this._apply({
      release: this._readJson(RELEASE_KEY),
      lastCheckedAt: Number.isFinite(cachedAt) ? cachedAt : 0,
      current: current && typeof current === 'object' ? current : this.status.current,
    })
  }

  /**
   * Своя версия. На устройстве — нативная (`@capacitor/app`: `build` — это
   * `versionCode`), в браузере версии нет, поэтому отдаём кэш (веб-сборка нужна
   * только для разработки и проверки).
   */
  async loadCurrentVersion() {
    if (this._currentPromise) return this._currentPromise

    this._currentPromise = (async () => {
      const cached = this._readJson(CURRENT_KEY)

      if (isNativePlatform()) {
        try {
          // Динамический импорт: в браузере и в тестах (Node) этот код не выполняется,
          // поэтому модуль плагина не тянется в веб-сборку и не ломает тесты.
          const { App } = await import('@capacitor/app')
          const info = await App.getInfo()
          const current = {
            versionCode: parseVersionCode(info?.build),
            versionName: info?.version ? String(info.version) : null,
          }

          storage.trySetItem(CURRENT_KEY, JSON.stringify(current))

          return current
        } catch (error) {
          logger.warn('[Update] не удалось прочитать версию приложения:', error?.message || error)
        }
      }

      return cached || { versionCode: null, versionName: null }
    })()

    return this._currentPromise
  }

  /** Проверка обновления. По умолчанию — не чаще раза в 6 часов (`force` обходит). */
  async check({ force = false } = {}) {
    if (this.status.checking) return this.getStatus()
    if (!force && this._isFresh()) return this.getStatus()

    const current = await this.loadCurrentVersion()

    this._apply({ current, checking: true, error: null })

    if (!this._isOnline()) {
      // Офлайн — не ошибка: приложение работает, проверка дождётся сети.
      return this._apply({ checking: false, online: false, error: null })
    }

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

  /** «Напомнить позже»: действует только для необязательного обновления. */
  dismiss() {
    const key = this._releaseKey(this.status.release)

    if (key !== null && this.status.mandatory !== true) {
      storage.trySetItem(DISMISSED_KEY, String(key))
    }

    return this._apply()
  }

  /** Сбрасывает «позже» — кнопка «Проверить обновление» в настройках. */
  clearDismiss() {
    storage.removeItem(DISMISSED_KEY)

    return this._apply()
  }

  _isFresh() {
    return this.status.lastCheckedAt > 0 && Date.now() - this.status.lastCheckedAt < CHECK_INTERVAL_MS
  }

  /** Приводим ответ сервера к одному виду (в т.ч. легаси-ответ без `versionCode`). */
  _normalizeRelease(data) {
    if (!data || typeof data !== 'object') return null
    if (!data.versionCode && !data.versionName && !data.version) return null

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
    }
  }

  /** Первая проверка отложена, дальше — по таймеру и сразу при появлении сети. */
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

