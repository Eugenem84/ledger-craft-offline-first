// src/utils/appUpdateView.js
//
// Представление состояния обновления приложения (Фаза 13, задача 13.6).
//
// Как и `syncStatusView`, это чистая функция: баннер только показывает результат,
// а приоритеты (обязательное обновление важнее «позже», ошибка проверки не мешает
// работе) проверяются обычным тестом (`test/update-view.test.js`).
//
// Что важно помнить:
//   • «новее» решает `versionCode` (целое из нативной сборки) — Android сравнивает
//     именно его, поэтому строку «1.10» так сравнивать нельзя;
//   • если сервер ещё не знает `versionCode` (легаси-ответ без манифеста релизов),
//     сравниваем `versionName` построчно — хуже, но лучше, чем ничего;
//   • «позже» не действует для обязательного обновления и для версии ниже
//     минимально поддерживаемой (`minSupportedVersionCode`).

/** Разбирает `build` из `@capacitor/app` (строка) в целое или `null`. */
export function parseVersionCode(value) {
  const code = Number.parseInt(String(value ?? ''), 10)

  return Number.isFinite(code) && code > 0 ? code : null
}

/**
 * Идентификатор OTA-бандла (Фаза 15). Это **не** версия для сравнения: плагин
 * различает бандлы по строке (`bundleId`), а «какой новее» решает сервер — он отдаёт
 * в манифесте тот бандл, который считает актуальным.
 */
export function parseBundleVersion(value) {
  const version = String(value ?? '').trim()

  return version === '' ? null : version
}

/** Построчное сравнение «1.10 > 1.9» — фолбэк, когда `versionCode` неизвестен. */
export function compareVersionNames(a, b) {
  const left = String(a ?? '')
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0)
  const right = String(b ?? '')
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)

    if (diff !== 0) return diff > 0 ? 1 : -1
  }

  return 0
}

/** Есть ли обновление: сначала `versionCode`, затем `versionName`. */
export function isUpdateAvailable({ currentVersionCode, currentVersionName, release }) {
  if (!release) return false

  const releaseCode = parseVersionCode(release.versionCode)
  const currentCode = parseVersionCode(currentVersionCode)

  if (releaseCode !== null && currentCode !== null) {
    return releaseCode > currentCode
  }

  if (release.versionName) {
    if (currentVersionName) return compareVersionNames(release.versionName, currentVersionName) > 0

    // Своей версии не знаем (веб-сборка): лучше показать баннер, чем промолчать.
    return true
  }

  return false
}

/** Обязательно ли обновление: флаг релиза или версия ниже минимально поддерживаемой. */
export function isUpdateMandatory({ currentVersionCode, release }) {
  if (!release) return false
  if (release.mandatory === true) return true

  const minCode = parseVersionCode(release.minSupportedVersionCode)
  const currentCode = parseVersionCode(currentVersionCode)

  if (minCode === null || currentCode === null) return false

  return currentCode < minCode
}

/**
 * Есть ли OTA-обновление веб-слоя (Фаза 15).
 *
 * Правила:
 *   • бандл не наш (мы уже на нём) → обновлять нечего;
 *   • бандл требует более нового APK (`minNativeVersionCode`) → молчим: всё равно
 *     не поедет, пока мастер не поставит APK (это решает нативное обновление);
 *   • своей версии не знаем (браузер) → тоже молчим: OTA доступно только в приложении.
 */
export function isBundleUpdateAvailable({ currentBundleId, bundle, currentVersionCode }) {
  if (!bundle || !bundle.url) return false

  const version = parseBundleVersion(bundle.version)

  if (version === null) return false

  const current = parseBundleVersion(currentBundleId)

  if (current !== null && current === version) return false

  const minNative = parseVersionCode(bundle.minNativeVersionCode)
  const native = parseVersionCode(currentVersionCode)

  // Бандл требует более нового APK, чем установлен: сначала установка (задача 15.6).
  if (minNative !== null && native !== null && native < minNative) return false

  /*
   * Обратный случай (задача 15.16): бандл собран для **более старого** APK.
   * Конвенция: `minNativeVersionCode` — это код сборки, для которой бандл собран (скрипт релиза
   * подставляет текущий `APP_VERSION_CODE`). Значит встроенный веб-слой установленного APK
   * не старее, и «обновление без установки» откатило бы мастеру интерфейс — тот самый случай
   * «поставил новый APK, а приложение предложило старый бандл с контура».
   * Ноль/пустое значение = «ограничения нет» (так публиковали до появления конвенции):
   * такие бандлы понижением не считаем.
   */
  if (minNative !== null && native !== null && minNative > 0 && minNative < native) return false

  return true
}

/** «1.2» либо «сборка 12» — как показать релиз пользователю. */
export function updateReleaseLabel(release) {
  if (!release) return ''

  return String(release.versionName || release.versionCode || '')
}

/** Размер файла для диалога: «12,3 МБ» / «845 КБ». */
export function formatBytes(bytes) {
  const size = Number(bytes)

  if (!Number.isFinite(size) || size <= 0) return ''

  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`

  return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
}

/**
 * Состояние баннера обновления.
 *
 * Приоритет: обязательное нативное → доступное нативное → готовое OTA-обновление
 * («применится после перезапуска») → доступное OTA-обновление → ничего.
 * Ошибка/офлайн самой проверки баннер НЕ показывают: проверка фоновая, и шуметь
 * «не удалось проверить» поверх работы мастерской нельзя (текст для настроек
 * отдаёт `appUpdateStatusText`).
 *
 * Нативное обновление важнее OTA: новый APK приносит и новый веб-слой, поэтому
 * пока мастеру нужно ставить APK, показываем именно его (и его нельзя отложить,
 * если оно обязательное).
 *
 * @param {{checking?: boolean, release?: object|null, available?: boolean,
 *   mandatory?: boolean, dismissed?: boolean, error?: string|null, online?: boolean,
 *   bundleAvailable?: boolean, bundleDismissed?: boolean, bundleReady?: boolean}} status
 * @returns {{visible: boolean, kind: string, icon: string, color: string, label: string,
 *   spin: boolean, canDismiss: boolean}}
 */
export function appUpdateView(status) {
  const s = status || {}
  const release = s.release || null

  const hidden = {
    visible: false,
    kind: 'up_to_date',
    icon: 'check_circle',
    color: 'positive',
    label: '',
    spin: false,
    canDismiss: false,
  }

  const nativeUpdate = s.available === true && Boolean(release)
  const bundleReady = !nativeUpdate && release?.bundle && s.bundleReady === true
  const bundleUpdate =
    !nativeUpdate && release?.bundle && s.bundleAvailable === true && s.bundleDismissed !== true

  if (!nativeUpdate && !bundleReady && !bundleUpdate) {
    // Отдельное состояние «проверяем» нужно секции настроек, но не баннеру.
    return s.checking === true
      ? { ...hidden, kind: 'checking', icon: 'system_update', color: 'secondary', spin: true }
      : hidden
  }

  if (nativeUpdate) {
    const version = updateReleaseLabel(release)

    if (s.mandatory === true) {
      return {
        visible: true,
        kind: 'mandatory',
        icon: 'system_update_alt',
        color: 'deep-orange',
        label: `нужно обновиться: ${version}`,
        spin: false,
        canDismiss: false,
      }
    }

    if (s.dismissed === true) {
      return hidden
    }

    return {
      visible: true,
      kind: 'optional',
      icon: 'system_update_alt',
      color: 'secondary',
      label: `доступна версия ${version}`,
      spin: false,
      canDismiss: true,
    }
  }

  if (bundleReady) {
    return {
      visible: true,
      kind: 'ota_ready',
      icon: 'restart_alt',
      color: 'positive',
      label: 'обновление после перезапуска',
      spin: false,
      canDismiss: false,
    }
  }

  return {
    visible: true,
    kind: 'ota',
    icon: 'cloud_download',
    color: 'secondary',
    label: 'обновление без установки',
    spin: false,
    canDismiss: true,
  }
}

/** Текст для секции «О приложении» — он нужен всегда, даже когда баннера нет. */
export function appUpdateStatusText(status) {
  const s = status || {}

  if (s.checking === true) return 'Проверяем обновление…'
  if (s.error) return 'Не удалось проверить обновление — попробуйте позже'
  if (s.online === false) return 'Нет интернета — проверка обновлений недоступна'

  if (s.available === true && s.release) {
    const version = updateReleaseLabel(s.release)

    return s.mandatory === true
      ? `Требуется обновление до версии ${version}`
      : `Доступна версия ${version}`
  }

  // OTA-обновление веб-слоя (Фаза 15): «установка» тут ни при чём — приложение
  // просто скачает бандл и применит его при следующем запуске.
  if (s.bundleReady === true) {
    return 'Обновление скачано — применится после перезапуска приложения'
  }

  if (s.bundleAvailable === true) {
    return 'Доступно обновление без установки'
  }

  return s.lastCheckedAt ? 'Установлена последняя версия' : 'Обновления ещё не проверялись'
}

