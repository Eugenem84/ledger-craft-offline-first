// src/utils/feedbackView.js
//
// Чистая логика отчёта «Сообщить об ошибке» (Фаза 14, задача 14.3).
//
// Здесь и только здесь собирается payload отчёта по контракту `docs/FEEDBACK.md` §3.
// Поэтому правила («что кладём», «что обрезаем», «чего не кладём никогда») проверяются
// тестами без DOM, без сети и без БД — в том числе приватность: список полей закрыт,
// данных мастерской (заказы/клиенты/суммы) в отчёте нет по построению, а не «по
// договорённости». Диагностику форматируем тем же представлением, что «снимок для
// поддержки» (12.5): не заводим второй формат для того же смысла.
import { buildDiagnosticSnapshot, formatLogEntry } from 'src/utils/devInfo.js'

/** Типы отчёта. `bug` — умолчание: кнопка называется «Сообщить об ошибке». */
export const FEEDBACK_KINDS = ['bug', 'suggestion', 'question']

export const FEEDBACK_KIND_LABELS = {
  bug: 'Ошибка',
  suggestion: 'Предложение',
  question: 'Вопрос',
}

/** Границы текста мастера (совпадают с валидацией сервера). */
export const FEEDBACK_MESSAGE_MIN = 3
export const FEEDBACK_MESSAGE_MAX = 4000

/** Лимиты вложений (совпадают с обрезкой на сервере). */
export const FEEDBACK_ERRORS_LIMIT = 50
export const FEEDBACK_LOGS_LIMIT = 100

/** Длина одной строки лога/ошибки внутри отчёта. */
export const FEEDBACK_LINE_LIMIT = 500

/**
 * Закрытый список полей payload. Тест приватности проверяет по нему, что в отчёт не
 * просочились данные мастерской (ни `client_id`, ни сумм, ни названий заказов).
 */
export const FEEDBACK_FIELDS = [
  'uuid_id',
  'kind',
  'message',
  'contact',
  'screen',
  'app_version',
  'platform',
  'platform_version',
  'device',
  'api_url',
  'schema_version',
  'schema_stored',
  'account',
  'profile',
  'sync',
  'errors',
  'logs',
  'client_created_at',
]

/** Поля снимка синка, которые попадают в отчёт. */
const SYNC_FIELDS = ['online', 'pendingCount', 'failedCount', 'consecutiveFailures', 'lastError']

/** Обрезка строки по лимиту (с «…» в конце). */
export function clipText(value, limit = FEEDBACK_LINE_LIMIT) {
  const text = value == null ? '' : String(value)

  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

/** Неизвестный тип отчёта приводим к `bug`, а не отбрасываем отчёт. */
export function normalizeKind(kind) {
  return FEEDBACK_KINDS.includes(kind) ? kind : 'bug'
}

/**
 * Можно ли отправлять текст. Возвращает готовое объяснение для формы, а не boolean:
 * сообщение показывается мастеру как есть.
 * @returns {{ok: boolean, reason: string}}
 */
export function canSubmitFeedback(text) {
  const value = text == null ? '' : String(text).trim()

  if (value.length < FEEDBACK_MESSAGE_MIN) {
    return { ok: false, reason: `Опишите проблему (минимум ${FEEDBACK_MESSAGE_MIN} символа)` }
  }

  if (value.length > FEEDBACK_MESSAGE_MAX) {
    return { ok: false, reason: `Слишком длинный текст (максимум ${FEEDBACK_MESSAGE_MAX} символов)` }
  }

  return { ok: true, reason: '' }
}

/** Хвост буфера: не больше `limit` записей, у каждой обрезано сообщение. */
export function limitEntries(entries, limit) {
  if (!Array.isArray(entries)) return []

  const list = entries
    .filter(entry => entry && entry.message)
    .slice(-limit)
    .map(entry => ({
      time: entry.time ? String(entry.time) : '',
      level: entry.level === 'warn' ? 'warn' : 'error',
      message: clipText(entry.message),
      ...(entry.screen ? { screen: clipText(entry.screen, 200) } : {}),
    }))

  return list
}

/** Снимок синка: берём только известные поля (никаких «лишних» объектов из состояния). */
function normalizeSync(sync) {
  if (!sync || typeof sync !== 'object') return null

  const result = {}

  for (const field of SYNC_FIELDS) {
    result[field] = sync[field] === undefined ? null : sync[field]
  }

  return result
}

/**
 * Собирает payload отчёта. Поля перечислены явно (см. `FEEDBACK_FIELDS`), поэтому
 * посторонние данные в отчёт попасть не могут.
 *
 * @param {object} options
 * @param {string} options.uuidId id отчёта на устройстве (идемпотентность повторов)
 * @param {string} options.kind тип отчёта (`bug`/`suggestion`/`question`)
 * @param {string} options.message текст мастера
 * @param {string} [options.contact] как ответить (необязательно)
 * @param {string|null} [options.screen] маршрут на момент отчёта
 * @param {object} [options.diagnostics] окружение: версия, платформа, схема, аккаунт, синк
 * @param {Array} [options.errors] хвост постоянного буфера ошибок (`utils/errorLog.js`)
 * @param {Array} [options.logs] кольцевой буфер логгера (только по согласию мастера)
 * @param {number} [options.createdAt] epoch-мс (для проверяемых тестов)
 * @returns {object} отчёт
 */
export function buildFeedbackReport({
  uuidId = null,
  kind = 'bug',
  message = '',
  contact = '',
  screen = null,
  diagnostics = {},
  errors = [],
  logs = [],
  createdAt = null,
} = {}) {
  const time = createdAt ? new Date(createdAt) : new Date()
  const diag = diagnostics && typeof diagnostics === 'object' ? diagnostics : {}

  return {
    uuid_id: uuidId || null,
    kind: normalizeKind(kind),
    message: clipText(String(message).trim(), FEEDBACK_MESSAGE_MAX),
    contact: clipText(contact || '', 200),
    screen: screen ? clipText(screen, 200) : null,
    app_version: diag.appVersion ? clipText(diag.appVersion, 100) : null,
    platform: diag.platform ? String(diag.platform) : null,
    platform_version: diag.platformVersion ? clipText(diag.platformVersion, 200) : null,
    device: diag.device ? clipText(diag.device, 100) : null,
    api_url: diag.apiUrl ? String(diag.apiUrl) : null,
    schema_version: diag.schemaVersion ?? null,
    schema_stored: diag.schemaStored ?? null,
    account: diag.account ? String(diag.account) : '',
    profile: diag.profile ? String(diag.profile) : '',
    sync: normalizeSync(diag.sync),
    errors: limitEntries(errors, FEEDBACK_ERRORS_LIMIT),
    logs: limitEntries(logs, FEEDBACK_LOGS_LIMIT),
    client_created_at: time.toISOString(),
  }
}

/**
 * Представление статуса отчёта для UI: подпись, цвет чипа и пояснение.
 * @param {string} status `pending`/`sending`/`sent`/`failed`
 * @param {{attempts?: number, lastError?: string|null, serverId?: number|null}} [meta]
 */
export function feedbackStatusView(status, { attempts = 0, lastError = null, serverId = null } = {}) {
  if (status === 'sent') {
    return {
      label: 'отправлено',
      color: 'positive',
      hint: serverId ? `№ ${serverId}` : 'сервер принял отчёт',
    }
  }

  if (status === 'sending') {
    return { label: 'отправляется', color: 'secondary', hint: 'идёт запрос' }
  }

  if (status === 'failed') {
    return {
      label: 'не ушло',
      color: 'negative',
      hint: lastError || 'текст отчёта можно скопировать и переслать вручную',
    }
  }

  return {
    label: 'в очереди',
    color: 'grey-6',
    hint: attempts ? `попыток: ${attempts}` : 'уедет, когда появится сеть',
  }
}

/**
 * Текстовая версия отчёта — для кнопки «копировать в буфер» (аварийный путь без
 * сервера) и для выгрузки в `feedback/inbox/` руками. Формат — тот же «снимок для
 * поддержки» (12.5), поэтому читается и человеком, и агентом одинаково.
 *
 * @param {object} report отчёт из `buildFeedbackReport`
 * @returns {string}
 */
export function feedbackTextFromReport(report) {
  if (!report || typeof report !== 'object') return ''

  const sync = report.sync || {}
  const syncRows = SYNC_FIELDS.filter(field => sync[field] != null).map(field => ({
    label: field,
    value: String(sync[field]),
  }))

  return buildDiagnosticSnapshot([
    {
      title: `отчёт: ${FEEDBACK_KIND_LABELS[report.kind] || report.kind}`,
      rows: [
        { label: 'время', value: report.client_created_at || '' },
        { label: 'отчёт id', value: report.uuid_id || '' },
        { label: 'экран', value: report.screen || '—' },
        { label: 'контакт', value: report.contact || '—' },
      ],
      lines: [report.message || ''],
    },
    {
      title: 'окружение',
      rows: [
        { label: 'версия приложения', value: report.app_version || 'неизвестна' },
        { label: 'платформа', value: report.platform || '—' },
        { label: 'версия ОС', value: report.platform_version || '—' },
        { label: 'API_URL', value: report.api_url || '—' },
        {
          label: 'схема',
          value:
            report.schema_stored == null
              ? `эталон ${report.schema_version ?? '?'} · в БД неизвестно`
              : `эталон ${report.schema_version ?? '?'} · в БД ${report.schema_stored}`,
        },
        { label: 'аккаунт', value: report.account || '—' },
        { label: 'профиль', value: report.profile || '—' },
      ],
    },
    { title: 'синхронизация', rows: syncRows },
    {
      title: `ошибки (${(report.errors || []).length})`,
      lines: (report.errors || []).map(formatLogEntry),
    },
    {
      title: `логи (${(report.logs || []).length})`,
      lines: (report.logs || []).map(formatLogEntry),
    },
  ])
}

