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
 * Приоритет: обязательное обновление → доступное обновление → ничего.
 * Ошибка/офлайн самой проверки баннер НЕ показывают: проверка фоновая, и шуметь
 * «не удалось проверить» поверх работы мастерской нельзя (текст для настроек
 * отдаёт `appUpdateStatusText`).
 *
 * @param {{checking?: boolean, release?: object|null, available?: boolean,
 *   mandatory?: boolean, dismissed?: boolean, error?: string|null, online?: boolean}} status
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

  if (s.available !== true || !release) {
    // Отдельное состояние «проверяем» нужно секции настроек, но не баннеру.
    return s.checking === true
      ? { ...hidden, kind: 'checking', icon: 'system_update', color: 'secondary', spin: true }
      : hidden
  }

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
    icon: 'system_update',
    color: 'secondary',
    label: `доступна версия ${version}`,
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

  return s.lastCheckedAt ? 'Установлена последняя версия' : 'Обновления ещё не проверялись'
}

