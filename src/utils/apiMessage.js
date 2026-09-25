// src/utils/apiMessage.js
//
// Русские сообщения об ошибках из ответов Laravel (Фаза 16: вход, регистрация,
// восстановление пароля).
//
// Часть ответов приходит на английском: ошибки валидации Laravel —
// «The email field is required.», «The password must be at least 6 characters.»
// Показывать это мастеру нельзя, поэтому прогоняем текст через словарь точных
// совпадений и набор шаблонов; сообщения с кириллицей (их отдают наши контроллеры:
// «Пользователь с таким email не зарегистрирован.») оставляем как есть.
//
// Тот же приём, что в `src/stores/useAuthStore.js` для входа/регистрации, но здесь
// один источник правды для новых экранов (сброс пароля, подтверждение почты).

/** Точные сообщения (ключ — строка ровно в том виде, как её отдаёт бэкенд). */
const EXACT_MESSAGES = {
  'These credentials do not match our records.': 'Неверный email или пароль.',
  'The provided credentials are incorrect.': 'Неверный email или пароль.',
  'Invalid credentials.': 'Неверный email или пароль.',
  'Unauthenticated.': 'Нужно войти в аккаунт.',
  'This action is unauthorized.': 'Недостаточно прав для этого действия.',
  'Forbidden': 'Доступ запрещён.',
  'Not Found': 'Данные не найдены.',
  'Page Expired': 'Сессия устарела. Обновите страницу и попробуйте снова.',
  'Server Error': 'Ошибка сервера. Попробуйте позже.',
  'Service Unavailable': 'Сервис временно недоступен. Попробуйте позже.',
  'Too Many Attempts.': 'Слишком много попыток. Попробуйте позже.',
  'Too many requests.': 'Слишком много запросов. Попробуйте позже.',
  'Network Error': 'Нет соединения с сервером. Проверьте интернет-соединение.',
  'This password reset token is invalid.': 'Ссылка для сброса пароля недействительна или устарела.',
  'No application encryption key has been specified.':
    'Сервер не настроен для отправки писем. Сообщите разработчику.',
}

/** Русские подписи полей: ключи — как Laravel приводит атрибуты. */
const ATTRIBUTE_NAMES = {
  name: 'имя',
  email: 'email',
  password: 'пароль',
  token: 'ссылка',
  password_confirmation: 'подтверждение пароля',
}

/** Шаблоны сообщений валидации Laravel. */
const VALIDATION_PATTERNS = [
  [
    /^The (.+?) has already been taken\.$/i,
    m => (m[1].toLowerCase() === 'email' ? 'Такой email уже зарегистрирован.' : `Поле «${attributeLabel(m[1])}» уже занято.`),
  ],
  [
    /^The (.+?) field is required\.$/i,
    m => `Укажите ${attributeLabel(m[1])}.`,
  ],
  [
    /^The (.+?) must be a valid email address\.$/i,
    () => 'Некорректный email.',
  ],
  [
    /^The (.+?) must be at least (\d+) characters\.$/i,
    m => `${capitalize(attributeLabel(m[1]))}: минимум ${m[2]} символов.`,
  ],
  [
    /^The (.+?) confirmation does not match\.$/i,
    () => 'Пароли не совпадают.',
  ],
  [
    /^The (.+?) field is invalid\.$/i,
    m => `Некорректное значение поля «${attributeLabel(m[1])}».`,
  ],
  [
    /^The (.+?) field is required when (.+?) is present\.$/i,
    m => `Заполните поле «${attributeLabel(m[1])}».`,
  ],
]

/** Подсказки по HTTP-статусу, когда тело ответа пустое. */
const STATUS_MESSAGES = {
  401: 'Неверный email или пароль.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Данные не найдены.',
  408: 'Сервер не дождался ответа. Попробуйте снова.',
  419: 'Сессия устарела. Обновите страницу и попробуйте снова.',
  422: 'Проверьте правильность заполнения полей.',
  429: 'Слишком много попыток. Попробуйте позже.',
  500: 'Ошибка сервера. Попробуйте позже.',
  502: 'Сервис временно недоступен. Попробуйте позже.',
  503: 'Сервис временно недоступен. Попробуйте позже.',
  504: 'Сервис временно недоступен. Попробуйте позже.',
}

const CYRILLIC_RE = /[а-яё]/i

function attributeLabel(attribute) {
  const key = String(attribute || '').toLowerCase().trim()

  return ATTRIBUTE_NAMES[key] || key || 'поле'
}

function capitalize(text) {
  const value = String(text || '')

  return value ? value[0].toUpperCase() + value.slice(1) : value
}

/**
 * Переводит сообщение бэкенда на русский.
 *
 * @param {*} text текст ответа
 * @returns {string|null} русский текст, исходный русский текст или `null`, если
 *                        сообщение английское и неизвестное
 */
export function translateMessage(text) {
  if (typeof text !== 'string') return null

  const trimmed = text.trim()

  if (!trimmed) return null

  let result = EXACT_MESSAGES[trimmed]

  if (result === undefined) {
    for (const [pattern, build] of VALIDATION_PATTERNS) {
      const match = trimmed.match(pattern)

      if (match) {
        result = build(match)
        break
      }
    }
  }

  // Сообщение уже на русском — оставляем без изменений.
  if (result === undefined && CYRILLIC_RE.test(trimmed)) result = trimmed

  return result === undefined ? null : result
}

/**
 * Достаёт из ошибки axios готовое русское сообщение для показа пользователю.
 *
 * Порядок: ошибки валидации → общее сообщение ответа → подсказка по статусу → фолбэк.
 *
 * @param {*} error ошибка запроса (axios)
 * @param {string} fallback текст по умолчанию, если распознать не удалось
 * @returns {string} сообщение для отображения
 */
export function extractApiMessage(error, fallback = 'Что-то пошло не так. Попробуйте ещё раз.') {
  const response = error?.response

  if (!response) {
    return translateMessage(error?.message) ?? 'Нет связи с сервером. Проверьте интернет-соединение.'
  }

  // 1. Ошибки валидации: { errors: { field: ['текст', ...] } }
  const errors = response.data?.errors

  if (errors && typeof errors === 'object') {
    const parts = Object.values(errors)
      .flat()
      .map(value => translateMessage(value) ?? (typeof value === 'string' ? value : null))
      .filter(Boolean)

    if (parts.length) return parts.join(' ')
  }

  // 2. Общее сообщение ответа.
  const message = translateMessage(response.data?.message)

  if (message) return message

  // 3. Подсказка по HTTP-статусу.
  return STATUS_MESSAGES[response.status] ?? fallback
}
