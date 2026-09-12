// src/router/authGuard.js
//
// Навигационный guard (задача 7.5): `meta.requiredAuth` в маршрутах объявлен, но
// нигде не проверялся, поэтому страницы заказа открывались без входа.
//
// Правило простое: защищено всё, у чего `meta.requiredAuth !== false` (публичные
// маршруты помечаются явно — сейчас это только `/login`). Если токена нет —
// отправляем на вход и запоминаем, куда пользователь шёл; если токен есть, но
// приложение заперто PIN-кодом — на тот же экран в режиме разблокировки.
//
// Это чистая фабрика (без Vue/Quasar и без обязательного Pinia), поэтому правило
// проверяется юнит-тестом `test/auth-guard.test.js` с подставными зависимостями.

import { useAuthStore } from 'src/stores/useAuthStore.js'

/** Куда вернуть пользователя после входа (кладём в query, если путь не корневой). */
export function redirectQuery(to) {
  const fullPath = to?.fullPath

  if (typeof fullPath === 'string' && fullPath !== '' && fullPath !== '/' && fullPath !== '/login') {
    return { redirect: fullPath }
  }

  return {}
}

/**
 * @param {{
 *   isAuthenticated?: () => boolean,
 *   isUnlocked?: () => boolean,
 *   loginPath?: string,
 * }} [deps] зависимости подменяются в тестах; по умолчанию читаем auth-стор
 * @returns {(to: object) => true|object} guard для `router.beforeEach`
 */
export function createAuthGuard(deps = {}) {
  const isAuthenticated = deps.isAuthenticated || (() => useAuthStore().isAuthenticated)
  const isUnlocked = deps.isUnlocked || (() => useAuthStore().unlocked)
  const loginPath = deps.loginPath || '/login'

  return function authGuard(to) {
    // Публичный маршрут (вход) — пропускаем всегда.
    if (to?.meta?.requiredAuth === false) return true

    if (!isAuthenticated() || !isUnlocked()) {
      return { path: loginPath, query: redirectQuery(to) }
    }

    return true
  }
}
