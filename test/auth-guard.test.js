// test/auth-guard.test.js
//
// Задача 7.5: правило доступа проверяется чистой фабрикой `createAuthGuard` —
// с подставными зависимостями, без Vue, router и Pinia. Правило: защищено всё,
// у чего `meta.requiredAuth !== false`; без токена или при запертом PIN — на вход.
import { describe, it, expect } from 'vitest'
import { createAuthGuard, redirectQuery } from 'src/router/authGuard.js'

const route = (fullPath, meta = {}) => ({ fullPath, meta })
const guest = () => createAuthGuard({ isAuthenticated: () => false, isUnlocked: () => false })
const signedIn = () =>
  createAuthGuard({ isAuthenticated: () => true, isUnlocked: () => true })

describe('7.5 auth-guard', () => {
  it('публичный маршрут (/login) пропускает без входа', () => {
    expect(guest()(route('/login', { requiredAuth: false }))).toBe(true)
  })

  it('без токена уводит на вход и запоминает, куда шёл пользователь', () => {
    expect(guest()(route('/orders/123', { requiredAuth: true }))).toEqual({
      path: '/login',
      query: { redirect: '/orders/123' },
    })
  })

  it('защищает маршруты по умолчанию (без meta.requiredAuth)', () => {
    expect(guest()(route('/orders')).path).toBe('/login')
  })

  it('с токеном, но запертым PIN — тоже на вход (там разблокировка)', () => {
    const guard = createAuthGuard({ isAuthenticated: () => true, isUnlocked: () => false })
    expect(guard(route('/orders/1')).path).toBe('/login')
  })

  it('вход выполнен и приложение разблокировано — пропускает', () => {
    expect(signedIn()(route('/orders/1'))).toBe(true)
  })

  it('redirectQuery не добавляет ссылку на корень, сам /login и пустой путь', () => {
    expect(redirectQuery(route('/'))).toEqual({})
    expect(redirectQuery(route('/login'))).toEqual({})
    expect(redirectQuery(route('/store'))).toEqual({ redirect: '/store' })
    expect(redirectQuery(undefined)).toEqual({})
  })
})
