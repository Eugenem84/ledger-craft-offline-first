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
import syncService from 'src/services/syncService.js'
import { generateSalt, hashPin, verifyPinHash } from 'src/utils/pin.js'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'
const PIN_HASH_KEY = 'auth_pin_hash'
const PIN_SALT_KEY = 'auth_pin_salt'
// Кто владеет локальными данными устройства. Ключ НЕ чистится при выходе:
// только так следующий вход может понять, что пришёл другой аккаунт (см. ниже).
const OWNER_KEY = 'auth_owner_id'

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
    /**
     * Почта подтверждена (Фаза 16, мягкая верификация).
     *
     * `email_verified_at` приезжает в объекте пользователя при входе/регистрации и
     * после `fetchMe()`. Неподтверждённый адрес **не блокирует** работу и синк —
     * приложение только показывает баннер и предлагает отправить письмо повторно.
     */
    isEmailVerified: state => Boolean(state.user?.email_verified_at),
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
        await this._resetLocalDataIfOwnerChanged(data?.user)
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
        await this._resetLocalDataIfOwnerChanged(data?.user)
        return data
      } catch (err) {
        this.error = this._registerErrorText(err)
        throw err
      } finally {
        this.loading = false
      }
    },

    /**
     * Запрос письма для сброса пароля (Фаза 16).
     *
     * Письмо формирует сервер (`ResetPasswordNotification`): ссылка ведёт на
     * https-bridge бэкенда, откуда открывается приложение. Ответ различает
     * «адрес не зарегистрирован» (404) — экран показывает это отдельно.
     */
    async requestPasswordReset(email) {
      const { data } = await apiClient.post('/forgot-password', { email })

      return data
    },

    /** Новый пароль по токену из письма (токен и email пришли по deep link). */
    async resetPassword({ token, email, password, passwordConfirmation }) {
      const { data } = await apiClient.post('/reset-password', {
        token,
        email,
        password,
        password_confirmation: passwordConfirmation,
      })

      return data
    },

    /** Повторная отправка письма с ссылкой подтверждения (мягкая верификация). */
    async resendVerificationEmail() {
      const { data } = await apiClient.post('/email/verification-notification')

      return data
    },

    /**
     * Перечитывает профиль с сервера (`GET /me`).
     *
     * Нужен после подтверждения почты: приложение открылось по ссылке, адрес уже
     * подтверждён, и баннер «подтвердите почту» должен погаснуть без перезахода.
     * Ошибку не бросаем: офлайн — нормальное состояние приложения.
     */
    async fetchMe() {
      if (!this.token) return null

      try {
        const { data } = await apiClient.get('/me')

        this.user = data || null

        if (this.user) storage.trySetItem(USER_KEY, JSON.stringify(this.user))

        return this.user
      } catch (err) {
        logger.warn('[Auth] Не удалось обновить профиль:', err?.message || err)

        return this.user
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

    /**
     * Удаление аккаунта (Фаза 17) — безвозвратно, вместе со всеми данными.
     *
     * Порядок принципиален: сначала удаляем на сервере (там каскадом/явно исчезают
     * профили, заказы, клиенты, каталог, склад и «хвосты»), и только потом чистим
     * устройство. Если сервер недоступен — ничего не удаляем: иначе на телефоне не
     * осталось бы ничего, а аккаунт жил бы дальше.
     *
     * Ошибку бросаем дальше: экран настроек показывает текст из `this.error`.
     */
    async deleteAccount() {
      this.loading = true
      this.error = null

      try {
        await apiClient.delete('/delete-account')
      } catch (err) {
        this.error = this._deleteErrorText(err)
        throw err
      } finally {
        this.loading = false
      }

      // Локальную копию убираем «best effort»: на сервере данных уже нет, и устройство
      // не должно остаться с ними, даже если сброс БД почему-то не удался.
      try {
        await syncService.fullReset()
      } catch (err) {
        logger.error('[Auth] Аккаунт удалён на сервере, но локальный сброс не удался:', err)
      }

      // Владельца локальных данных тоже забываем: устройство снова «чистое».
      storage.removeItem(OWNER_KEY)
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

    /**
     * Смена аккаунта на устройстве (дефект живого прогона, 11.6).
     *
     * Локальная БД и очередь операций **общие для всех пользователей устройства**
     * (`docs/ARCHITECTURE.md`: разделение данных — на сервере, задача 3.10). Из этого
     * следуют две беды, если аккаунт сменился, а локальные данные остались:
     *   • операции предыдущего аккаунта уезжают на сервер под НОВЫМ токеном и
     *     привязываются к новому пользователю;
     *   • курсоры синка (`meta.last_synced_at:*`) остаются от предыдущего аккаунта,
     *     поэтому `/sync-updates` вернёт новому только свежие записи — старые
     *     потеряются.
     *
     * Поэтому при смене владельца полностью сбрасываем локальное состояние
     * (`syncService.fullReset()` чистит таблицы, очередь и курсоры). Повторный вход
     * тем же аккаунтом ничего не трогает — офлайн-работа продолжается.
     *
     * @param {{ id?: number|string }|null|undefined} user пользователь из ответа сервера
     */
    async _resetLocalDataIfOwnerChanged(user) {
      const nextOwner = user?.id != null ? String(user.id) : null
      const previousOwner = storage.getItem(OWNER_KEY)
      const ownerChanged = Boolean(previousOwner && nextOwner && previousOwner !== nextOwner)

      if (ownerChanged) {
        // Смена владельца: данные прежнего аккаунта должны исчезнуть **до** того, как
        // новый начнёт работать. Ошибку не глотаем: иначе в локальной БД остаются чужие
        // заказы и клиенты, а вход выглядит успешным (дефект живого прогона).
        try {
          await syncService.fullReset()
        } catch (err) {
          logger.error('[Auth] Не удалось сбросить данные прежнего аккаунта:', err)

          // Не входим в новый аккаунт поверх чужих данных и не помечаем смену
          // владельца завершённой: следующий вход повторит попытку сброса.
          this.clearSession()

          const failure = new Error('Не удалось очистить данные прежнего аккаунта — попробуйте ещё раз')
          failure.code = 'LOCAL_RESET_FAILED'
          throw failure
        }

        logger.log(
          `[Auth] Смена аккаунта (${previousOwner} → ${nextOwner}): локальные данные сброшены`
        )
      }

      // Владельца запоминаем только после успешного сброса — иначе неудачный сброс
      // «закрепил» бы чужой набор данных за новым аккаунтом, и повторного сброса
      // уже не случилось бы.
      if (nextOwner) storage.trySetItem(OWNER_KEY, nextOwner)
    },

    _loginErrorText(err) {
      const status = err?.response?.status

      if (status === 401) return 'Неверный email или пароль'
      if (err?.code === 'LOCAL_RESET_FAILED') return err.message
      if (!err?.response) return 'Нет связи с сервером — для первого входа нужен интернет'

      return err?.response?.data?.message || 'Не удалось войти'
    },

    /** Текст ошибки удаления аккаунта: сервер — обязательный участник, офлайн не годится. */
    _deleteErrorText(err) {
      const status = err?.response?.status

      if (status === 401) return 'Сессия истекла — войдите снова'
      if (!err?.response) return 'Нужен интернет: удаление аккаунта выполняет сервер'

      return err?.response?.data?.message || 'Не удалось удалить аккаунт'
    },

    /** Текст ошибки регистрации: занятый email и прочие 422 приходят как `errors`. */
    _registerErrorText(err) {
      const status = err?.response?.status
      const data = err?.response?.data

      if (err?.code === 'LOCAL_RESET_FAILED') return err.message
      if (!err?.response) return 'Нет связи с сервером — для регистрации нужен интернет'
      if (status === 422) {
        const firstError = data?.errors && Object.values(data.errors)[0]
        return Array.isArray(firstError) ? firstError[0] : data?.message || 'Проверьте данные'
      }

      return data?.message || 'Не удалось зарегистрироваться'
    },
  },
})
