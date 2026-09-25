// src/domain/deepLinks.js
//
// Разбор ссылок из писем (подтверждение почты и сброс пароля).
//
// Клиент — Android-приложение, веб-версии пока нет, поэтому письмо не может вести на
// страницу SPA. Ссылка ведёт на https-адрес бэкенда (`/app/reset`, `/app/verified`), а
// бэкенд уводит пользователя в приложение: напрямую через Android App Links или через
// bridge-страницу со схемой `ledgercraft://` (`resources/views/app-link.blade.php`).
//
// Здесь — чистая функция «URL → маршрут + параметры». Ни Vue, ни Quasar, ни Capacitor,
// поэтому правило проверяется юнит-тестом (`test/deep-links.test.js`), а boot-файл
// `src/boot/deepLinks.js` только вызывает её и делает `router.push`.
//
// ⚠️ Ветки и пути должны совпадать с бэкендом (`config/app-links.php`) и с
// intent-filter в `src-capacitor/android/app/src/main/AndroidManifest.xml`.

/** Схема приложения: `ledgercraft://…` (фолбэк, когда App Links не верифицированы). */
export const DEEP_LINK_SCHEME = 'ledgercraft'

/** Префикс https-ссылок, которые обрабатывает Android App Links. */
export const APP_LINK_PREFIX = 'app'

/** Ветка/сегмент ссылки → маршрут приложения (`src/router/routes.js`). */
const ROUTE_BY_BRANCH = {
  reset: '/reset-password',
  'reset-password': '/reset-password',
  verified: '/verify-email',
  'verify-email': '/verify-email',
}

/**
 * Разбирает deep link в маршрут приложения.
 *
 * Поддерживаются обе формы:
 *   • своя схема — `ledgercraft://reset-password?token=…&email=…`
 *     (её отдаёт bridge-страница бэкенда);
 *   • https App Link — `https://<host>/app/reset?token=…&email=…`
 *     (её открывает Android, когда домен верифицирован через assetlinks.json).
 *
 * @param {*} rawUrl ссылка, как её отдал плагин `@capacitor/app`
 * @returns {{ path: string, query: Record<string, string> }|null} маршрут или `null`,
 *          если ссылка не наша (её не нужно открывать в приложении)
 */
export function parseDeepLink(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return null

  let url

  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }

  const branch = readBranch(url)
  const path = branch ? ROUTE_BY_BRANCH[branch] : null

  if (!path) return null

  return { path, query: readQuery(url) }
}

/**
 * Ветка ссылки: host для своей схемы, первый сегмент после `/app` для App Link.
 * Пустая строка — ссылка не наша.
 */
function readBranch(url) {
  // `ledgercraft://reset-password?…` → hostname = reset-password
  // `ledgercraft:///reset-password?…` → hostname пуст, берём первый сегмент пути
  if (url.protocol === `${DEEP_LINK_SCHEME}:`) {
    return (url.hostname || firstSegment(url.pathname)).toLowerCase()
  }

  // `https://<host>/app/reset?…` → сегменты [app, reset]
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    const segments = url.pathname.split('/').filter(Boolean)

    if (segments[0] !== APP_LINK_PREFIX) return ''

    return (segments[1] || '').toLowerCase()
  }

  return ''
}

function firstSegment(pathname) {
  const segment = String(pathname || '')
    .split('/')
    .filter(Boolean)[0]

  return segment || ''
}

/** Параметры запроса без пустых значений (пустые тянуть незачем). */
function readQuery(url) {
  const query = {}

  url.searchParams.forEach((value, key) => {
    if (value !== '') query[key] = value
  })

  return query
}
