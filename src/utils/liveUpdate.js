// src/utils/liveUpdate.js
//
// Мост к нативному плагину OTA-обновлений веб-слоя (`@capawesome/capacitor-live-update`,
// Фаза 15). Приложение обновляется «по воздуху»: скачивает zip с новым JS/CSS/HTML,
// проверяет хэш и применяет его при следующем запуске — без установки APK и без
// системного диалога.
//
// Зачем отдельным модулем: как `ApkInstaller` и `@capacitor/app`, плагин подключается
// **динамическим импортом** — в браузере и в тестах модуль плагина не загружается.
// `updateService` работает только через этот мост, поэтому цепочку «скачать бандл →
// назначить → перезапустить» можно проверить без Capacitor и без телефона
// (`vi.mock('src/utils/liveUpdate.js')` в тестах).
//
// Что важно помнить (подробно — README §«Обновление без установки»):
//   • OTA обновляет **только веб-слой**. Нативный код (плагины, разрешения,
//     `versionCode`) по-прежнему требует нового APK;
//   • `ready()` нужно звать как можно раньше: пока его нет, плагин считает бандл
//     «непроверенным» и после `readyTimeout` сам вернётся к встроенному (авто-откат);
//   • `setNextBundle()` без `reload()` применит бандл при следующем запуске —
//     предпочтительный режим: мастер ничего не теряет в середине работы.
import { isNativePlatform } from 'src/utils/platform.js'
import { logger } from 'src/utils/logger.js'
import { NATIVE_CALL_TIMEOUT_MS, withTimeout } from 'src/utils/async.js'

export { NATIVE_CALL_TIMEOUT_MS }

/** Плагин вообще возможен на этой платформе (в браузере — нет). */
export function isLiveUpdateSupported() {
  return isNativePlatform()
}

/**
 * Плагин OTA из динамического импорта (в веб-сборку и в тесты этот модуль не попадает).
 *
 * ⚠️ Возвращаем **обёртку — обычный объект**, а не сам прокси плагина Capacitor.
 * Прокси на незнакомое свойство отвечает ошибкой «не реализовано», а `then` — ровно такое
 * свойство: движок, увидев у значения `then`, считает его thenable и вызывает его, чтобы
 * «дождаться» значения. Прокси при этом **не отклоняет промис, а оставляет его в ожидании
 * навсегда** — и любой `await` на таком значении висит вечно.
 *
 * Именно это и был живой дефект 1.11–1.12 (отчёт мастера от 15.09.2026:
 * `"LiveUpdate.then()" is not implemented on android`): молчали `ready()`, текущий бандл и
 * версия из плагина, а вместе с ними «повисала» вся проверка обновлений. Обёртка без `then`
 * безопасна: её методы — обычные функции, привязанные к плагину.
 *
 * (В плагине установки APK тот же приём применён изначально: `loadApkInstaller()` возвращает
 * `{ ApkInstaller }`, то есть тоже обычный объект.)
 */
const LIVE_UPDATE_METHODS = [
  'ready',
  'getCurrentBundle',
  'getVersionCode',
  'getVersionName',
  'downloadBundle',
  'setNextBundle',
  'reload',
  'reset',
  'addListener',
]

/** Импорт делаем один раз: модуль кэширован, а таймаут не должен повторяться на каждый вызов. */
let liveUpdatePromise = null

function loadLiveUpdate() {
  if (liveUpdatePromise === null) {
    liveUpdatePromise = withTimeout(
      import('@capawesome/capacitor-live-update'),
      'импорт плагина OTA'
    ).then(module => {
      const plugin = module?.LiveUpdate
      const wrapper = {}

      for (const method of LIVE_UPDATE_METHODS) {
        try {
          const fn = plugin?.[method]

          if (typeof fn === 'function') wrapper[method] = fn.bind(plugin)
        } catch {
          // Такого метода нет в этой версии плагина — просто не кладём его в обёртку:
          // вызывающий получит `undefined` и обработает это как «плагин недоступен».
        }
      }

      return wrapper
    })
  }

  return liveUpdatePromise
}

/** Идентификатор работающего бандла; `null` — работаем на встроенном (из APK). */
export async function getCurrentBundleId() {
  const LiveUpdate = await loadLiveUpdate()
  const result = await withTimeout(LiveUpdate.getCurrentBundle(), 'getCurrentBundle')
  const bundleId = result?.bundleId

  return bundleId === undefined || bundleId === null || bundleId === '' ? null : String(bundleId)
}

/**
 * Версия приложения через плагин OTA: `versionCode` (строка).
 *
 * Зачем второй источник: `@capacitor/app` — единственная точка отказа (живой дефект:
 * на Android «версия неизвестна», хотя в веб-сборке значение было). Плагин читает тот же
 * `PackageInfo`, но другим кодом, поэтому годится как фолбэк.
 */
export async function getAppVersionCode() {
  const LiveUpdate = await loadLiveUpdate()
  const result = await withTimeout(LiveUpdate.getVersionCode(), 'LiveUpdate.getVersionCode()')

  return result?.versionCode ?? null
}

/** Версия приложения через плагин OTA: `versionName` (строка). */
export async function getAppVersionName() {
  const LiveUpdate = await loadLiveUpdate()
  const result = await withTimeout(LiveUpdate.getVersionName(), 'LiveUpdate.getVersionName()')

  return result?.versionName ?? null
}

/** Есть ли плагин в этой сборке APK: старые сборки (до Фазы 15) его не содержат. */
export async function hasLiveUpdatePlugin() {
  if (!isLiveUpdateSupported()) return false

  try {
    await getCurrentBundleId()

    return true
  } catch (error) {
    logger.log('[Update] OTA-плагин недоступен:', error?.message || error)

    return false
  }
}

/**
 * «Текущий бандл рабочий». Без этого вызова плагин по таймауту вернётся к встроенному
 * бандлу — так плохое OTA-обновление откатывается само, без мастера и без APK.
 */
export async function ready() {
  if (!isLiveUpdateSupported()) return false

  const LiveUpdate = await loadLiveUpdate()

  await withTimeout(LiveUpdate.ready(), 'ready')

  return true
}

/** Скачивание бандла с прогрессом: `onProgress` получает долю 0..1. */
export async function downloadBundle({ url, bundleId, checksum = null, onProgress = null }) {
  const LiveUpdate = await loadLiveUpdate()
  let handle = null

  if (typeof onProgress === 'function') {
    try {
      handle = await LiveUpdate.addListener('downloadBundleProgress', event => {
        // Событие общее для плагина — прогресс чужого бандла нам не нужен.
        if (event?.bundleId && bundleId && String(event.bundleId) !== String(bundleId)) return

        onProgress(Number(event?.progress) || 0)
      })
    } catch (error) {
      logger.log('[Update] прогресс OTA-загрузки недоступен:', error?.message || error)
    }
  }

  try {
    const options = { url, bundleId }

    // `checksum` — SHA-256 в base64. Плагин сверит его сам и не применит битый файл.
    if (checksum) options.checksum = checksum

    return await LiveUpdate.downloadBundle(options)
  } finally {
    try {
      await handle?.remove()
    } catch {
      // подписка могла уже отвалиться — загрузке это не мешает
    }
  }
}

/** Назначает бандл «следующим»: применится при следующем запуске приложения. */
export async function setNextBundle(bundleId) {
  const LiveUpdate = await loadLiveUpdate()

  await LiveUpdate.setNextBundle({ bundleId })
}

/** Перезапуск приложения на новом бандле — кнопка «Перезапустить сейчас». */
export async function reloadApplication() {
  const LiveUpdate = await loadLiveUpdate()

  await LiveUpdate.reload()
}

/** Возврат к встроенному бандлу (диагностика и ручной откат). */
export async function reset() {
  const LiveUpdate = await loadLiveUpdate()

  await LiveUpdate.reset()
}
