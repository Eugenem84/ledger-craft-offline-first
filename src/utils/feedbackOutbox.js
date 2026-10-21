// src/utils/feedbackOutbox.js
//
// Резервная очередь отчётов «Сообщить об ошибке» (Фаза 21).
//
// Зачем: основная очередь живёт в SQLite (`repositories/feedbackRepo.js`), но
// именно её отказ и надо сообщить разработчику. На боевом контуре (отчёт мастера
// 19.10.2026) локальная БД не открылась, `feedbackRepo.enqueue()` упал с
// `[SQLITE] База не открыта`, и **канал обратной связи оказался заблокирован
// собственной поломкой**: мастер видел SQL-текст вместо «отчёт отправлен».
//
// Здесь отчёт ждёт отправки в `localStorage` — он не зависит от SQLite и
// переживает перезапуск. `feedbackService` читает обе очереди и досылает их
// одинаково, поэтому для мастера разницы нет: сеть появилась — отчёт уехал.
import storage from 'src/utils/storage.js'
import { logger } from 'src/utils/logger.js'

/** Ключ хранения (JSON-массив отчётов). */
export const FEEDBACK_OUTBOX_KEY = 'feedback_outbox'

/** Сколько отчётов держим: очередь — аварийная, а не архив. */
export const FEEDBACK_OUTBOX_LIMIT = 20

/** Предел размера одного отчёта: localStorage не резиновый (5 МБ на домен). */
const MAX_REPORT_LENGTH = 50_000

/** Читает очередь. Битые данные не должны ломать ни отправку, ни приложение. */
function load() {
  const raw = storage.getItem(FEEDBACK_OUTBOX_KEY)

  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(entry => entry && typeof entry.id === 'string' && typeof entry.payload === 'string')
      .map(entry => ({
        id: entry.id,
        kind: entry.kind || 'bug',
        message: entry.message || '',
        payload: entry.payload,
        createdAt: Number(entry.createdAt) || Date.now(),
        attempts: Number(entry.attempts) || 0,
        status: entry.status || 'pending',
        lastError: entry.lastError || null,
      }))
  } catch {
    return []
  }
}

function save(list) {
  storage.trySetItem(FEEDBACK_OUTBOX_KEY, JSON.stringify(list.slice(0, FEEDBACK_OUTBOX_LIMIT)))
}

export default {
  /**
   * Ставит отчёт в резервную очередь.
   *
   * @param {{id: string, kind: string, message: string, payload: object|string, createdAt?: number}} report
   * @returns {object|null} запись или `null`, если она не влезла
   */
  add({ id, kind = 'bug', message = '', payload, createdAt = Date.now() }) {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload)

    if (!id || json.length > MAX_REPORT_LENGTH) {
      logger.warn('[Feedback] Отчёт не помещён в резервную очередь (слишком большой или без id)')

      return null
    }

    const record = {
      id,
      kind,
      message,
      payload: json,
      createdAt,
      attempts: 0,
      status: 'pending',
      lastError: null,
    }

    const list = load().filter(entry => entry.id !== id)
    list.unshift(record)
    save(list)

    logger.log('[Feedback] Отчёт сохранён в резервную очередь (локальная БД недоступна)')

    return record
  },

  /** Все отчёты резервной очереди (новые первыми). */
  list() {
    return load()
  },

  /** Сколько отчётов ждёт отправки. */
  count() {
    return load().filter(entry => entry.status === 'pending' || entry.status === 'sending').length
  },

  /** Частичное обновление записи (статус, попытки, текст ошибки). */
  update(id, patch = {}) {
    const list = load()
    const index = list.findIndex(entry => entry.id === id)

    if (index === -1) return null

    list[index] = { ...list[index], ...patch }
    save(list)

    return list[index]
  },

  remove(id) {
    const list = load().filter(entry => entry.id !== id)
    save(list)
  },

  /** Полная очистка (смена аккаунта/полный сброс). */
  clear() {
    storage.removeItem(FEEDBACK_OUTBOX_KEY)
  },

  /** Для тестов: подменять/читать «сырое» значение не требуется — есть `clear()`. */
  _key: FEEDBACK_OUTBOX_KEY,
}
