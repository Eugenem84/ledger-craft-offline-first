// src/utils/appVersion.js
//
// Версия приложения для шапки (правка владельца 15.09.2026): «на глаз» видеть,
// какая сборка стоит на телефоне. Чистая функция — правила проверяются юнит-тестом,
// а стор (`useUpdateStore.currentVersionShort`) остаётся тонким.
//
// Два источника, и это не дублирование:
//   • нативная версия (`@capacitor/app` → `versionName`/`versionCode`) — что реально
//     стоит на устройстве; она важнее вшитой в бандл, потому что после OTA веб-слой
//     может быть новее APK;
//   • версия, вшитая в сборку (`build.env` ← `src-capacitor/android/gradle.properties`,
//     см. `readAndroidVersion` в `quasar.config.js`, читается через `src/config.js`) —
//     фолбэк для веб-сборки, где нативной части нет вовсе.

/**
 * @param {{versionName?: string|null, versionCode?: number|string|null}} [current] версия с устройства
 * @param {{name?: string, code?: string|number}} [build] версия, вшитая в сборку
 * @returns {string} `v1.14` / `сборка 15` — или пусто, если версия неизвестна
 *   (тогда шапка не рисует ничего: слово «неизвестна» там только мешало бы).
 */
export function appVersionLabel(current, build = {}) {
  // Версия сборки приходит «короткими» полями (`name`/`code`) — приводим к общему виду.
  const device = current || {}
  const bundled = { versionName: build.name, versionCode: build.code }

  // Источники **не смешиваем**: устройство отдало хоть одно поле — показываем его
  // версию целиком, иначе взяли бы имя из бандла, а код со устройства.
  const hasDeviceVersion = Boolean(device.versionName || device.versionCode)
  const source = hasDeviceVersion ? device : bundled

  if (source.versionName) return `v${source.versionName}`
  if (source.versionCode) return `сборка ${source.versionCode}`

  return ''
}
