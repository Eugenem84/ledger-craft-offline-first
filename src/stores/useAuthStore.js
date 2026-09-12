// src/stores/useAuthStore.js
//
// Вход в приложение (задача 7.4). Две вещи, которые нельзя путать:
//   • СЕРВЕРНЫЙ ТОКЕН (Sanctum, `auth_token`) — без него `/sync` отвечает 401;
//     выдаётся `POST /api/login`, хранится в универсальном `utils/storage`.
//   • PIN-КОД — локальный замок приложения (соль + хеш в хранилище), чтобы
//     приложение не открывалось «само»; сам по себе доступ к данным он не даёт
//     (владелец данных фильтруется на сервере, задача 3.10).
//
// `unlocked` живёт только в памяти: перезапуск приложения снова требует PIN.
import { defineStore } from 'pinia'
import { logger } from 'src/utils/logger'
import storage from 'src/utils/storage'
import { apiClient } from 'src/services/api.js'
import { generateSalt, hashPin, verifyPinHash } from 'src/utils/pin.js'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const PIN_HASH_KEY = 'auth_pin_hash'
const PIN_SALT_KEY = 'auth_pin_salt'

function readStoredUser() {
  const raw = storage.getItem(USER_KEY)

  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const token = storage.getItem(TOKEN_KEY)
    const pinHash = storage.getItem(PIN_HASH_KEY)

    return {
      token,
      user: readStoredUser(),
      pinHash,
      pinSalt: storage.getItem(PIN_SALT_KEY),
      // Без PIN приложение открыто; с PIN — требуется ввод в начале сессии.
      unlocked: !pinHash,
      loading: false,
      error: null,
    }
  },

  getters: {
    isAuthenticated: state => Boolean(state.token),
    hasPin: state => Boolean(state.pinHash),
    /** Заперто: вход выполнен, PIN установлен, но ещё не введён. */
    isLocked: state => Boolean(state.token) && Boolean(state.pinHash) && !state.unlocked,
    userName: state => state.user?.name || state.user?.email || 'пользователь',
  },

  actions: {
    /**
     * Вход по email/паролю: получает токен Sanctum и сохраняет сессию.
     * Бросает ошибку дальше — экран входа показывает текст из `this.error`.
     */
    async login(email, password) {
      this.loading = true
      this.error = null

      try {
        const { data } = await apiClient.post('/login', { email, password })
        this._applySession(data)
        return data
      } catch (err) {
        this.error = this._loginErrorText(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    /**
     * Само-регистрация (Фаза 10, задача 10.5): создаёт аккаунт и возвращает
     * сессию — как `login`. Сервер вместе с пользователем создаёт выбранные
     * специализации (см. `AuthController::register`), поэтому ответ может
     * содержать `specializations` для локального онбординга.
     *
     * @param {{ name: string, email: string, password: string, passwordConfirmation: string,
     *   specializations?: Array<{ name: string, preset_key?: string }> }} payload
     */
    async register({ name, email, password, passwordConfirmation, specializations = [] }) {
      this.loading = true
      this.error = null

      try {
        const { data } = await apiClient.post('/register', {
          name,
          email,
          password,
          password_confirmation: passwordConfirmation,
          specializations,
        })
        this._applySession(data)
        return data
      } catch (err) {
        this.error = this._registerErrorText(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    /** Выход: серверу сообщаем по возможности (офлайн — не страшно), локально чистим всё. */
    async logout() {
      try {
        if (this.token) {
          await apiClient.post('/logout')
        }
      } catch (err) {
        logger.warn('[Auth] Сервер не подтвердил выход (офлайн?):', err?.message)
      }

      this.clearSession()
    },

    /** Локальная очистка сессии (без сети). */
    clearSession() {
      this.token = null
      this.user = null
      this.pinHash = null
      this.pinSalt = null
      this.unlocked = false
      this.error = null

      storage.removeItem(TOKEN_KEY)
      storage.removeItem(USER_KEY)
      storage.removeItem(PIN_HASH_KEY)
      storage.removeItem(PIN_SALT_KEY)
    },

    /** Читает сессию из хранилища (boot `auth`). Возвращает, есть ли токен. */
    restore() {
      this.token = storage.getItem(TOKEN_KEY)
      this.user = readStoredUser()
      this.pinHash = storage.getItem(PIN_HASH_KEY)
      this.pinSalt = storage.getItem(PIN_SALT_KEY)
      this.unlocked = !this.pinHash

      return this.isAuthenticated
    },

    /** Устанавливает PIN (после первого входа): соль + хеш, замок снимается на текущую сессию. */
    async setPin(pin) {
      const salt = generateSalt()
      const hash = await hashPin(pin, salt)

      storage.setItem(PIN_SALT_KEY, salt)
      storage.setItem(PIN_HASH_KEY, hash)

      this.pinSalt = salt
      this.pinHash = hash
      this.unlocked = true
      this.error = null
    },

    /** Проверяет PIN и снимает замок. Возвращает `false`, если PIN неверный. */
    async verifyPin(pin) {
      if (!this.pinHash || !this.pinSalt) {
        this.unlocked = true
        return true
      }

      const ok = await verifyPinHash(pin, this.pinSalt, this.pinHash)

      this.unlocked = ok
      this.error = ok ? null : 'Неверный PIN-код'

      return ok
    },

    /**
     * Реакция на 401 (регистрируется в `boot/auth.js`): токен отвергнут сервером —
     * забываем его, приложение вернётся на экран входа. PIN не трогаем: если он был,
     * после повторного входа замок останется.
     */
    handleUnauthorized() {
      if (!this.token) return

      logger.warn('[Auth] Сервер отверг токен — нужен повторный вход.')

      storage.removeItem(TOKEN_KEY)
      this.token = null
      this.unlocked = false
      this.error = 'Сессия истекла — войдите снова'
    },

    /** Сохраняет сессию из ответа `/login`. */
    _applySession(data) {
      const token = data?.access_token || data?.token || null

      if (!token) {
        throw new Error('Сервер не вернул токен доступа')
      }

      this.token = token
      this.user = data?.user || null
      this.unlocked = true
      this.error = null

      storage.trySetItem(TOKEN_KEY, token)

      if (this.user) {
        storage.trySetItem(USER_KEY, JSON.stringify(this.user))
      }
    },

    _loginErrorText(err) {
      const status = err?.response?.status

      if (status === 401) return 'Неверный email или пароль'
      if (!err?.response) return 'Нет связи с сервером — для первого входа нужен интернет'

      return err?.response?.data?.message || 'Не удалось войти'
    },

    /** Текст ошибки регистрации: занятый email и прочие 422 приходят как `errors`. */
    _registerErrorText(err) {
      const status = err?.response?.status
      const data = err?.response?.data

      if (!err?.response) return 'Нет связи с сервером — для регистрации нужен интернет'
      if (status === 422) {
        const firstError = data?.errors && Object.values(data.errors)[0]
        return Array.isArray(firstError) ? firstError[0] : data?.message || 'Проверьте данные'
      }

      return data?.message || 'Не удалось зарегистрироваться'
    },
  },
})
