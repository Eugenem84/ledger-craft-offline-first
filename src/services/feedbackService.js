// src/services/feedbackService.js
//
// Отправка отчётов «Сообщить об ошибке» (Фаза 14, задача 14.4).
//
// Работает офлайн-первым, как синк (6.1): отчёт сначала ложится в локальную очередь
// (`feedbackRepo`), и только потом делается попытка уехать. Нет сети или входа —
// отчёт остаётся `pending` и уходит сам, когда появится возможность
// (`startAutoFlush()` зовётся из `App.vue` вместе с автосинком).
//
// Транспорт — **не** синк (решение D7): отдельная ручка `POST /api/feedback` и своя
// идемпотентность по `uuid_id`. Повтор запроса не создаёт дубль: сервер ищет отчёт
// по `uuid_id` (тот же приём, что в синке, 3.5).
//
// Диагностика собирается в момент создания отчёта и фиксируется в `payload`:
// отправка может случиться позже, а состояние (версия, схема, очередь синка) должно
// быть тем, при котором мастер увидел проблему.
import { apiClient, hasAuthToken } from 'src/services/api.js'
import { API_URL } from 'src/config.js'
import db from 'src/database/db.js'
import { SCHEMA_VERSION } from 'src/database/schema-version.js'
import feedbackRepo from 'src/repositories/feedbackRepo.js'
import syncService from 'src/services/syncService.js'
import updateService from 'src/services/updateService.js'
import { getErrors } from 'src/utils/errorLog.js'
import { getLogBuffer, logger } from 'src/utils/logger.js'
import { platformName } from 'src/utils/platform.js'
import { buildFeedbackReport, canSubmitFeedback } from 'src/utils/feedbackView.js'

/** После скольких попыток отчёт «сдаётся» и остаётся только для ручного пути. */
const MAX_FEEDBACK_ATTEMPTS = 5

/** Периодическая досылка, пока приложение открыто (как у автосинка). */
const AUTO_FLUSH_INTERVAL_MS = 60000

class FeedbackService {
  constructor() {
    this._autoFlushStarted = false
    this._autoFlushTimer = null
    this._autoFlushTimeout = null
    this._onlineHandler = null
  }

  // --- Сборка отчёта ---------------------------------------------------------

  /** Версия приложения: `versionName (versionCode)` из сборки (задача 13.5). */
  _appVersion() {
    const current = updateService.getStatus()?.current || {}
    const name = current.versionName
    const code = current.versionCode

    if (!name && !code) return null
    if (name && code) return `${name} (${code})`

    return String(name || code)
  }

  /**
   * Версия ОС/среды: строка user-agent. Отдельного плагина устройства в проекте нет
   * (`device` в отчёте пока `null`), а UA даёт достаточно контекста для разбора.
   */
  _platformVersion() {
    if (typeof navigator === 'undefined') return null

    return navigator.userAgent ? String(navigator.userAgent) : null
  }

  /** Версия схемы, которая реально лежит в локальной БД (эталон — `SCHEMA_VERSION`). */
  async _schemaStored() {
    try {
      return await db.getSchemaVersion()
    } catch {
      return null
    }
  }

  /**
   * Собирает отчёт по текущему состоянию устройства.
   *
   * @param {object} options как у `submit`, плюс `uuidId`
   * @returns {Promise<object>} отчёт (`docs/FEEDBACK.md` §3)
   */
  async preview({
    uuidId = null,
    kind = 'bug',
    message = '',
    contact = '',
    screen = null,
    attachDiagnostics = true,
    includeLogs = false,
    account = '',
    profile = '',
  } = {}) {
    const diagnostics = attachDiagnostics
      ? {
          appVersion: this._appVersion(),
          platform: platformName(),
          platformVersion: this._platformVersion(),
          apiUrl: API_URL,
          schemaVersion: SCHEMA_VERSION,
          schemaStored: await this._schemaStored(),
          account,
          profile,
          sync: syncService.getStatus(),
        }
      : { account, profile }

    return buildFeedbackReport({
      uuidId,
      kind,
      message,
      contact,
      screen,
      diagnostics,
      // Хвост постоянного буфера ошибок уходит всегда: он и есть «что случилось».
      errors: attachDiagnostics ? getErrors() : [],
      // Полные логи — только по явному согласию мастера (приватность, §4 договора).
      logs: attachDiagnostics && includeLogs ? getLogBuffer() : [],
    })
  }

  // --- Постановка в очередь и отправка ---------------------------------------

  /**
   * Создаёт отчёт, кладёт его в локальную очередь и сразу пробует отправить.
   *
   * @param {object} options
   * @param {'bug'|'suggestion'|'question'} [options.kind]
   * @param {string} options.message текст мастера
   * @param {string} [options.contact] как ответить (необязательно)
   * @param {string|null} [options.screen] маршрут на момент отчёта
   * @param {boolean} [options.attachDiagnostics] приложить окружение/ошибки (по умолчанию да)
   * @param {boolean} [options.includeLogs] приложить полный буфер логов
   * @param {string} [options.account] имя аккаунта для контекста
   * @param {string} [options.profile] активный рабочий профиль
   * @returns {Promise<{id: string, report: object, sent: number, failed: number, pending: number}>}
   */
  async submit(options = {}) {
    const check = canSubmitFeedback(options.message)

    if (!check.ok) {
      const error = new Error(check.reason)
      error.code = 'FEEDBACK_INVALID'
      throw error
    }

    const id = options.id || (globalThis.crypto?.randomUUID?.() ?? `feedback-${Date.now()}`)
    const report = await this.preview({ ...options, uuidId: id })

    await feedbackRepo.enqueue({
      id,
      kind: report.kind,
      message: report.message,
      payload: report,
    })

    logger.log(`[Feedback] Отчёт ${id} сохранён локально (${report.kind})`)

    const result = await this.flush()

    return { id, report, ...result }
  }

  /**
   * Досылает очередь отчётов.
   *
   * Порядок: отчёты по одному, в порядке создания. Сетевой сбой останавливает проход
   * (не долбим недоступный сервер), «неисправимый» отчёт не мешает остальным.
   *
   * @returns {Promise<{sent: number, failed: number, pending: number}>}
   */
  async flush() {
    const state = { sent: 0, failed: 0, pending: 0 }

    if (!this._isOnline()) {
      state.pending = await feedbackRepo.countPending()
      return state
    }

    const records = await feedbackRepo.listPending()

    for (const record of records) {
      // Без входа отправлять некуда: отчёт дождётся входа, как очередь синка (7.4).
      if (!hasAuthToken()) break

      const outcome = await this._send(record)

      if (outcome === 'sent') {
        state.sent += 1
        continue
      }

      if (outcome === 'failed') {
        state.failed += 1
        continue
      }

      break
    }

    state.pending = await feedbackRepo.countPending()

    return state
  }

  /** Сколько отчётов ждёт отправки (для подписи под кнопкой в настройках). */
  async pendingCount() {
    return feedbackRepo.countPending()
  }

  /** Вся очередь отчётов (историю показывает диалог «Сообщить об ошибке»). */
  async listAll() {
    return feedbackRepo.listAll()
  }

  async _send(record) {
    await feedbackRepo.markSending(record.id)

    let payload

    try {
      payload = JSON.parse(record.payload)
    } catch {
      await feedbackRepo.markFailed(record.id, 'Битый payload отчёта')
      return 'failed'
    }

    const attempts = Number(record.attempts || 0) + 1

    try {
      const response = await apiClient.post('/feedback', payload)
      await feedbackRepo.markSent(record.id, response?.data?.server_id ?? null)
      logger.log(`[Feedback] Отчёт ${record.id} принят сервером`)
      return 'sent'
    } catch (error) {
      const message = this._errorText(error)

      if (this._isPermanent(error) || attempts >= MAX_FEEDBACK_ATTEMPTS) {
        logger.warn(`[Feedback] Отчёт ${record.id} не будет отправлен: ${message}`)
        await feedbackRepo.markFailed(record.id, message)
        return 'failed'
      }

      logger.warn(`[Feedback] Отчёт ${record.id} остался в очереди: ${message}`)
      await feedbackRepo.markPending(record.id, message)
      return 'pending'
    }
  }

  /**
   * «Неисправимые» ответы: повторять бессмысленно (ошибка данных/доступа), отчёт
   * остаётся у мастера с текстом ошибки. Сеть, таймаут, 408/429 и 5xx — повторяем.
   */
  _isPermanent(error) {
    const status = error?.response?.status

    if (status == null) return false

    return [400, 401, 403, 404, 413, 415, 422].includes(status)
  }

  _errorText(error) {
    const data = error?.response?.data

    return (
      (typeof data === 'string' ? data : data?.message || data?.error) ||
      error?.message ||
      'неизвестная ошибка'
    )
  }

  _isOnline() {
    return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
      ? true
      : navigator.onLine
  }

  // --- Фоновый дренаж очереди -------------------------------------------------

  /**
   * Включает досылку отчётов: сразу после старта, при возвращении сети и раз в
   * `intervalMs`. Идемпотентно (как `syncService.startAutoSync`), интерфейс не
   * блокируется: `flush()` уходит следующим тиком таймера.
   *
   * @param {{intervalMs?: number}} [options] `intervalMs: 0` — без периодического таймера
   */
  startAutoFlush(options = {}) {
    if (this._autoFlushStarted) return

    this._autoFlushStarted = true
    this._flushSoon()

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._onlineHandler = () => {
        void this.flush().catch(e => console.error('[Feedback] Досылка после сети упала:', e))
      }

      window.addEventListener('online', this._onlineHandler)
    }

    const intervalMs =
      typeof options.intervalMs === 'number' ? options.intervalMs : AUTO_FLUSH_INTERVAL_MS

    if (intervalMs > 0 && typeof setInterval === 'function') {
      this._autoFlushTimer = setInterval(() => this._flushSoon(), intervalMs)
    }
  }

  /** Выключает фоновую досылку (таймер, запланированный проход, обработчик сети). */
  stopAutoFlush() {
    if (this._autoFlushTimer != null) {
      clearInterval(this._autoFlushTimer)
      this._autoFlushTimer = null
    }

    if (this._autoFlushTimeout != null) {
      clearTimeout(this._autoFlushTimeout)
      this._autoFlushTimeout = null
    }

    if (this._onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener?.('online', this._onlineHandler)
    }

    this._onlineHandler = null
    this._autoFlushStarted = false
  }

  _flushSoon() {
    const run = () => {
      this._autoFlushTimeout = null
      this.flush().catch(e => console.error('[Feedback] Фоновая досылка упала:', e))
    }

    if (typeof setTimeout !== 'function') {
      run()
      return
    }

    this._autoFlushTimeout = setTimeout(run, 0)
  }
}

export default new FeedbackService()
export { MAX_FEEDBACK_ATTEMPTS }

