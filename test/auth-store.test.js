// test/auth-store.test.js
//
// Задача 7.4: стор авторизации. Сервер (axios-инстанс `apiClient`) подменён
// spy'ом; хранилище — шим localStorage из `test/setup.js`. Проверяем, что токен
// переживает «перезапуск», PIN запирает приложение, а ошибки входа понятны.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { apiClient } from 'src/services/api.js'
import storage from 'src/utils/storage.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'

function freshStore() {
  setActivePinia(createPinia())
  return useAuthStore()
}

function clearAuthStorage() {
  storage.removeItem('auth_token')
  storage.removeItem('auth_user')
  storage.removeItem('auth_pin_hash')
  storage.removeItem('auth_pin_salt')
}

describe('7.4 стор авторизации', () => {
  beforeEach(clearAuthStorage)

  afterEach(() => {
    vi.restoreAllMocks()
    clearAuthStorage()
  })

  it('login сохраняет токен и снимает замок', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { access_token: 'tok-1', user: { name: 'Иван' } } })

    const auth = freshStore()
    await auth.login('i@example.com', 'secret')

    expect(post).toHaveBeenCalledWith('/login', { email: 'i@example.com', password: 'secret' })
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.unlocked).toBe(true)
    expect(auth.userName).toBe('Иван')
    expect(storage.getItem('auth_token')).toBe('tok-1')
  })

  it('неверные учётные данные дают понятную ошибку, токен не сохраняется', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { status: 401 } })

    const auth = freshStore()
    await expect(auth.login('i@example.com', 'bad')).rejects.toBeTruthy()

    expect(auth.error).toBe('Неверный email или пароль')
    expect(auth.isAuthenticated).toBe(false)
    expect(storage.getItem('auth_token')).toBeNull()
  })

  it('без связи с сервером объясняет, что для первого входа нужен интернет', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('Network Error'))

    const auth = freshStore()
    await expect(auth.login('i@example.com', 'secret')).rejects.toBeTruthy()

    expect(auth.error).toContain('интернет')
  })

  it('PIN переживает «перезапуск»: замок взведён, верный PIN снимает его', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { access_token: 'tok-2', user: null } })

    const auth = freshStore()
    await auth.login('i@example.com', 'secret')
    await auth.setPin('1234')

    expect(auth.hasPin).toBe(true)
    expect(auth.unlocked).toBe(true)

    // Перезапуск приложения: новый стор читает состояние из хранилища.
    const restarted = freshStore()
    restarted.restore()

    expect(restarted.isAuthenticated).toBe(true)
    expect(restarted.isLocked).toBe(true)

    expect(await restarted.verifyPin('0000')).toBe(false)
    expect(restarted.unlocked).toBe(false)

    expect(await restarted.verifyPin('1234')).toBe(true)
    expect(restarted.isLocked).toBe(false)
  })

  it('logout очищает токен и PIN', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { access_token: 'tok-3', user: null } })

    const auth = freshStore()
    await auth.login('i@example.com', 'secret')
    await auth.setPin('1234')

    await auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.hasPin).toBe(false)
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('auth_pin_hash')).toBeNull()
  })

  it('401 от сервера (handleUnauthorized) забывает токен', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { access_token: 'tok-4', user: null } })

    const auth = freshStore()
    await auth.login('i@example.com', 'secret')

    auth.handleUnauthorized()

    expect(auth.isAuthenticated).toBe(false)
    expect(storage.getItem('auth_token')).toBeNull()
  })
})
