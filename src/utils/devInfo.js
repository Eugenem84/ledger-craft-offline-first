// src/utils/devInfo.js
//
// Снимки для вкладки «Режим разработчика» (задача 12.5).
//
// Здесь только **чистые** функции форматирования: панель (`DeveloperPanel.vue`)
// собирает данные из конфига, БД и синка, а преобразование в строки живёт тут —
// так его можно проверить тестами без DOM и без реальной БД.

/** Обрезает длинный текст, сохраняя начало («…» в конце). */
export function truncate(value, limit = 140) {
  const text = value == null ? '' : String(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

/**
 * Краткое представление payload операции очереди.
 * Принимает и JSON-строку (как в таблице `operations`), и готовый объект.
 */
export function summarizePayload(payload, limit = 140) {
  if (payload == null) return ''

  let text

  if (typeof payload === 'string') {
    try {
      text = JSON.stringify(JSON.parse(payload))
    } catch {
      text = payload
    }
  } else {
    try {
      text = JSON.stringify(payload)
    } catch {
      text = String(payload)
    }
  }

  return truncate(text, limit)
}

/** Строка очереди операций для панели. */
export function describeOperation(operation = {}) {
  return {
    key: operation.id ?? `${operation.table ?? '?'}:${operation.created_at ?? 0}`,
    type: operation.type ?? '',
    table: operation.table ?? '',
    status: operation.status ?? '',
    attempts: Number(operation.attempts) || 0,
    createdAt: operation.created_at ?? null,
    payload: summarizePayload(operation.payload),
  }
}

/** Строка буфера логов: `чч:мм:сс [уровень] сообщение`. */
export function formatLogEntry(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string') return entry

  const time = entry.time ? new Date(entry.time).toLocaleTimeString() : ''
  const prefix = [time, entry.level ? `[${entry.level}]` : ''].filter(Boolean).join(' ')

  return prefix ? `${prefix} ${entry.message ?? ''}`.trim() : String(entry.message ?? '')
}

/**
 * Состояние синка → пары «подпись → значение» для списка в панели.
 * @param {object} status снимок `SyncService.getStatus()`
 * @param {number} [now] текущее время (для проверяемого «повтор через»)
 */
export function describeSyncStatus(status = {}, now = Date.now()) {
  const retryInSeconds = status.nextRetryAt ? Math.ceil((status.nextRetryAt - now) / 1000) : 0

  return [
    { label: 'сеть', value: status.online ? 'онлайн' : 'офлайн' },
    { label: 'синхронизация', value: status.syncing ? 'идёт' : 'простой' },
    { label: 'нужен вход', value: status.requiresAuth ? 'да' : 'нет' },
    { label: 'в очереди', value: String(status.pendingCount ?? 0) },
    { label: 'сбоев подряд', value: String(status.consecutiveFailures ?? 0) },
    { label: 'повтор через', value: retryInSeconds > 0 ? `${retryInSeconds} с` : '—' },
    { label: 'последняя ошибка', value: status.lastError || '—' },
  ]
}

/** Версия схемы: эталон приложения и то, что реально лежит в БД. */
export function describeSchemaVersion(expected, stored) {
  if (stored == null) return `эталон ${expected} · в БД неизвестно`
  return stored === expected
    ? `${expected} (совпадает)`
    : `эталон ${expected} · в БД ${stored} (расхождение)`
}
