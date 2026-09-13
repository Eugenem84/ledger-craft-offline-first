// landing/landing.js
//
// Логика промо-страницы: показывает версию последней сборки и ведёт кнопку на свежий APK.
//
// Страница статическая, поэтому данных о релизе у неё нет — их отдаёт свободный
// `GET /api/app-version` (тот же, что использует само приложение для самообновления,
// см. `src/services/updateService.js` и `docs/API-INTEGRATION.md` §2.5). Если запрос
// не удался, кнопка всё равно ведёт на `GET /api/download-apk` (без параметра — последний
// релиз), поэтому скачивание работает и без JavaScript-обогащения.

;(function () {
  'use strict'

  /** База API. Меняется одной строкой в `index.html` (window.LEDGER_CRAFT_API). */
  var API = (window.LEDGER_CRAFT_API || 'https://dev.medovf2h.beget.tech/api').replace(/\/+$/, '')

  /** Ссылка «последний релиз» — валидна всегда, даже без манифеста релизов. */
  var LATEST_APK_URL = API + '/download-apk'

  /**
   * Эндпоинты версии, в порядке приоритета.
   *
   * `/app-version` — новый контракт (манифест релизов, `versionCode`/`apkUrl`).
   * `/app-quasar-android-version` — исторический путь: он есть на контурах со старой
   * сборкой бэкенда и отвечает легаси-форматом `{ version, apk_name }`. Пробуем по
   * очереди, чтобы страница работала на обоих контурах.
   */
  var VERSION_URLS = [API + '/app-version', API + '/app-quasar-android-version']

  var $ = function (id) {
    return document.getElementById(id)
  }

  /** «12,3 МБ» / «845 КБ» — как в диалоге обновления приложения. */
  function formatBytes(bytes) {
    var size = Number(bytes)

    if (!isFinite(size) || size <= 0) return ''

    if (size < 1024 * 1024) return Math.round(size / 1024) + ' КБ'

    return (size / (1024 * 1024)).toFixed(1).replace('.', ',') + ' МБ'
  }

  /** Приводит новый и легаси ответы к одному виду. */
  function normalizeRelease(data) {
    var release = data || {}

    return {
      versionCode: release.versionCode,
      // Новый контракт: `versionName`; легаси: `version`.
      versionName: release.versionName || release.version || '',
      apkUrl: release.apkUrl || LATEST_APK_URL,
      sha256: release.sha256 || '',
      sizeBytes: release.sizeBytes,
      mandatory: release.mandatory === true,
      notes: release.notes || '',
      releasedAt: release.releasedAt || null,
    }
  }

  /** «1.2» либо «сборка 12» — как показать версию. */
  function versionLabel(release) {
    if (!release) return ''

    return String(release.versionName || release.version || release.versionCode || '')
  }

  var DOWNLOAD_LINKS = '#download-button, #download-button-2, #nav-download'

  /**
   * Состояние кнопок скачивания.
   *
   * ⚠️ Пока APK-релиз не опубликован, `/api/download-apk` отвечает JSON-ошибкой
   * `404 {"error":"File not found"}`. Если у ссылки есть `href`, клик приведёт именно
   * на этот JSON — поэтому без релиза кнопки выключены (href снимаем).
   */
  function setDownloadState(enabled, url) {
    document.querySelectorAll(DOWNLOAD_LINKS).forEach(function (link) {
      if (enabled && url) {
        link.setAttribute('href', url)
        // `download` подсказывает браузеру сохранять файл, а не открывать его.
        link.setAttribute('download', '')
        link.classList.remove('btn--disabled')
        link.removeAttribute('aria-disabled')
      } else {
        link.removeAttribute('href')
        link.removeAttribute('download')
        link.classList.add('btn--disabled')
        link.setAttribute('aria-disabled', 'true')
      }
    })
  }

  /** Отдаёт ли эндпоинт именно APK (а не JSON-ошибку). */
  function isApkAvailable(url) {
    if (typeof fetch !== 'function') return Promise.resolve(false)

    return fetch(url, { method: 'HEAD' })
      .then(function (response) {
        if (!response.ok) return false

        var type = String(response.headers.get('content-type') || '')

        return /apk|android|octet-stream|zip/i.test(type)
      })
      .catch(function () {
        return false
      })
  }

  /** Наполняет блок релиза данными манифеста. */
  function applyRelease(release) {
    var label = versionLabel(release)
    var size = formatBytes(release.sizeBytes)

    $('cta-version').textContent = label || '—'
    $('cta-size').textContent = size || '—'
    $('cta-sha').textContent = release.sha256 || '—'

    $('release-version').textContent = label || '—'
    $('release-size').textContent = size || '—'
    $('release-notes').textContent = release.notes || ''

    var meta = []
    if (release.releasedAt)
      meta.push('опубликовано: ' + new Date(release.releasedAt).toLocaleString())
    if (release.mandatory) meta.push('обязательное обновление')
    $('release-meta').textContent = meta.join(' · ')

    $('release').hidden = false

    setDownloadState(true, release.apkUrl)
    $('cta-status').textContent = 'Готово к загрузке.'
    $('download-hint').textContent =
      'APK для Android. Установите файл и разрешите установку из этого источника.'
  }

  /**
   * Сборки нет (или её не удалось подтвердить): не отправляем в JSON-ошибку,
   * а выключаем кнопки и честно объясняем.
   */
  function applyUnavailable(message) {
    setDownloadState(false)
    $('cta-status').textContent = message
    $('download-hint').textContent =
      'Кнопка станет активной, как только на сервере появится опубликованная сборка.'
  }

  /**
   * Пробует эндпоинты версии по очереди. Отклоняется, если ни один не ответил
   * пригодным JSON (новый контракт или легаси).
   */
  function fetchRelease(index) {
    if (index >= VERSION_URLS.length) {
      return Promise.reject(new Error('ни один эндпоинт версии не ответил'))
    }

    return fetch(VERSION_URLS[index], { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)

        return response.json()
      })
      .catch(function () {
        return fetchRelease(index + 1)
      })
  }

  function loadRelease() {
    if (typeof fetch !== 'function') {
      applyUnavailable('Браузер не поддерживает запрос версии сборки.')
      return
    }

    fetchRelease(0)
      .then(function (data) {
        applyRelease(normalizeRelease(data))
      })
      .catch(function () {
        // Версию узнать не удалось, но файл может быть доступен — проверяем его напрямую
        // (HEAD отдаёт JSON-ошибку, если APK нет, — тогда кнопку не включаем).
        isApkAvailable(LATEST_APK_URL).then(function (available) {
          if (available) {
            setDownloadState(true, LATEST_APK_URL)
            $('cta-status').textContent = 'Версия неизвестна, но сборка доступна к загрузке.'
          } else {
            applyUnavailable('Сборка ещё не опубликована на этом сервере.')
          }
        })
      })
  }

  function init() {
    var year = $('year')
    if (year) year.textContent = String(new Date().getFullYear())

    // Пока не подтвердили релиз — кнопки выключены (иначе клик ведёт на JSON-ошибку).
    setDownloadState(false)
    loadRelease()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
