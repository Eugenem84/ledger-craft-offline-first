// src/config.js
//
// Конфигурация сборки (задача 7.1): раньше URL сервера и флаг моков были
// захардкожены в `src/services/api.js`. Теперь значения приходят из env-файлов.
//
// Откуда берём:
//   • Quasar CLI подмешивает `.env`/`.env.local` и подменяет `process.env.<KEY>`
//     на этапе сборки (см. `@quasar/app-vite/lib/utils/env.js`);
//   • Vite параллельно отдаёт `VITE_*`-переменные в `import.meta.env`.
//
// Читаем оба источника (первый непустой), поэтому конфиг работает и в прод-сборке
// Quasar, и в тестах, и в чистом Vite. `DEFAULT_API_URL` — страховка на случай
// сборки без env-файла.
//
// ⚠️ Обращения к переменным — только «точечные» (`import.meta.env.VITE_API_URL`).
// Если прочитать весь объект (`const env = import.meta.env`), подстановка не
// сработает, и код, который должен быть вырезан в проде, останется в бандле:
// именно так `mockApi.js` уезжал отдельным чанком.

const DEFAULT_API_URL = 'https://dev.medovf2h.beget.tech/api'

export const API_URL =
  import.meta.env.VITE_API_URL || process.env.VITE_API_URL || DEFAULT_API_URL

// `process.env.*` от Quasar приходит уже булевым ('true'/'false'), `import.meta.env`
// от Vite — строкой, поэтому нормализуем оба варианта.
function isFlagOn(value) {
  return value === true || value === 'true'
}

// Моки сетевого слоя (задача 7.2): только dev-сборка и только по явному флагу.
// В проде `import.meta.env.DEV` — литерал `false`, поэтому `USE_MOCK` сворачивается
// до `false`, а вместе с ним сборщик вырезает и динамический импорт `mockApi.js`.
export const USE_MOCK =
  import.meta.env.DEV === true &&
  isFlagOn(import.meta.env.VITE_USE_MOCK ?? process.env.VITE_USE_MOCK)

// Версия приложения, вшитая в сборку (правка владельца 15.09.2026).
//
// Источник — `src-capacitor/android/gradle.properties` (`APP_VERSION_NAME`/`_CODE`),
// их подставляет `readAndroidVersion` в `quasar.config.js`: это тот же номер, что
// показывает Android в настройках и что читают скрипты релиза. Нужен как фолбэк:
// нативную версию в браузере спросить не у кого, поэтому без неё в шапке было нечего
// показать. Правила подписи — в чистой `src/utils/appVersion.js`.
export const BUILD_APP_VERSION_NAME = process.env.APP_VERSION_NAME || ''
export const BUILD_APP_VERSION_CODE = process.env.APP_VERSION_CODE || ''

