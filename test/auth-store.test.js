// test/auth-store.test.js
//
// Задача 7.4: стор авторизации. Сервер (axios-инстанс `apiClient`) подменён
// spy'ом; хранилище — шим localStorage из `test/setup.js`. Проверяем, что токен
// переживает «перезапуск», PIN запирает приложение, а ошибки входа понятны.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { apiClient } from 'src/services/api.js'
import storage from 'src/utils/storage.js'
import syncService from 'src/services/syncService.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'

function freshStore() {
  setActivePinia(createPinia())
  return useAuthStore()
}

function clearAuthStorage() {
  storage.removeItem('auth_token')
  storage.removeItem('auth_user')
  storage.removeItem('auth_owner_id')
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

  // Фаза 16: восстановление пароля (ссылка из письма → приложение) и мягкая
  // верификация почты.

  it('запрос письма для сброса пароля уходит на /forgot-password', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { message: 'Письмо отправлено' } })

    const auth = freshStore()
    const data = await auth.requestPasswordReset('i@example.com')

    expect(post).toHaveBeenCalledWith('/forgot-password', { email: 'i@example.com' })
    expect(data.message).toBe('Письмо отправлено')
  })

  it('новый пароль уходит на /reset-password с токеном, email и подтверждением', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { message: 'Пароль обновлён' } })

    const auth = freshStore()
    await auth.resetPassword({
      token: 'tok',
      email: 'i@example.com',
      password: 'newpass',
      passwordConfirmation: 'newpass',
    })

    expect(post).toHaveBeenCalledWith('/reset-password', {
      token: 'tok',
      email: 'i@example.com',
      password: 'newpass',
      password_confirmation: 'newpass',
    })
  })

  it('повторная отправка письма подтверждения уходит на свою ручку', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { message: 'Письмо отправлено повторно.' } })

    const auth = freshStore()
    const data = await auth.resendVerificationEmail()

    expect(post).toHaveBeenCalledWith('/email/verification-notification')
    expect(data.message).toContain('повторно')
  })

  it('fetchMe обновляет профиль и геттер isEmailVerified', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { access_token: 'tok-10', user: { id: 1, email_verified_at: null } },
    })

    const auth = freshStore()
    await auth.login('i@example.com', 'secret')

    expect(auth.isEmailVerified).toBe(false)

    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { id: 1, email: 'i@example.com', email_verified_at: '2026-09-24T10:00:00.000000Z' },
    })

    await auth.fetchMe()

    expect(auth.isEmailVerified).toBe(true)
    expect(JSON.parse(storage.getItem('auth_user')).email_verified_at).toBe(
      '2026-09-24T10:00:00.000000Z'
    )
  })

  it('fetchMe без токена ничего не запрашивает (офлайн/гость)', async () => {
    const get = vi.spyOn(apiClient, 'get')

    const auth = freshStore()
    const result = await auth.fetchMe()

    expect(result).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  // Фаза 17: удаление аккаунта вместе с данными.

  it('удаление аккаунта стирает данные на сервере, локально и забывает владельца', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { access_token: 'tok-del', user: { id: 7, email: 'i@example.com' } },
    })

    const auth = freshStore()
    await auth.login('i@example.com', 'secret')
    expect(storage.getItem('auth_owner_id')).toBe('7')

    const del = vi
      .spyOn(apiClient, 'delete')
      .mockResolvedValue({ data: { message: 'Аккаунт удалён' } })
    const reset = vi.spyOn(syncService, 'fullReset').mockResolvedValue(undefined)

    await auth.deleteAccount()

    expect(del).toHaveBeenCalledWith('/delete-account')
    expect(reset).toHaveBeenCalledTimes(1)
    expect(auth.isAuthenticated).toBe(false)
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('auth_owner_id')).toBeNull()
  })

  it('офлайн удаление аккаунта не выполняется и локальные данные целы', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { access_token: 'tok-del-2', user: { id: 8, email: 'i@example.com' } },
    })

    const auth = freshStore()
    await auth.login('i@example.com', 'secret')

    vi.spyOn(apiClient, 'delete').mockRejectedValue(new Error('Network Error'))
    const reset = vi.spyOn(syncService, 'fullReset').mockResolvedValue(undefined)

    await expect(auth.deleteAccount()).rejects.toBeTruthy()

    expect(reset).not.toHaveBeenCalled()
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.error).toContain('интернет')
  })
})
