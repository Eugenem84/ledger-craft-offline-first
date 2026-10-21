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
import db, { getDbState } from 'src/database/db.js'
import { SCHEMA_VERSION } from 'src/database/schema-version.js'
import feedbackRepo from 'src/repositories/feedbackRepo.js'
import feedbackOutbox from 'src/utils/feedbackOutbox.js'
import syncService from 'src/services/syncService.js'
import updateService from 'src/services/updateService.js'
import { getErrors } from 'src/utils/errorLog.js'
import { getLogBuffer, logger } from 'src/utils/logger.js'
import { platformName } from 'src/utils/platform.js'
import { buildFeedbackReport, canSubmitFeedback } from 'src/utils/feedbackView.js'

/**
 * После скольких **ответов сервера** «попробуй позже» (408/429 и прочие 4xx) отчёт
 * «сдаётся» и остаётся только для ручного пути.
 *
 * Сетевые сбои (нет ответа вовсе) лимитом **не** считаются: офлайн — это штатное
 * состояние приложения, и отчёт не должен теряться (дефект 14.36 — на боевом
 * контуре так пропал отчёт `e559e951`: пять `Network Error` подряд, и он больше
 * не отправлялся никогда). `5xx` тоже не сдаётся — сервер может лежать долго.
 */
const MAX_FEEDBACK_ATTEMPTS = 5

/**
 * Пауза перед следующей попыткой после неудачной отправки (по возрастанию, мс).
 * Живёт в памяти: в БД отчёт остаётся `pending`, поэтому перезапуск приложения
 * паузу не наследует — она нужна лишь чтобы не долбить недоступную сеть каждую
 * минуту. Если платформа сообщает «сеть есть» (`navigator.onLine === true`),
 * пауза не применяется: она гасит попытки только в реальном офлайне.
 */
const RETRY_BACKOFF_MS = [15000, 30000, 60000, 120000, 300000]

/** Периодическая досылка, пока приложение открыто (как у автосинка). */
const AUTO_FLUSH_INTERVAL_MS = 60000

class FeedbackService {
  constructor() {
    this._autoFlushStarted = false
    this._autoFlushTimer = null
    this._autoFlushTimeout = null
    this._onlineHandler = null
    /** id отчёта → момент (мс), раньше которого попытку не повторяем (офлайн-пауза). */
    this._retryAfter = new Map()
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
          // Состояние локальной БД (Фаза 21): без него разбор отчёта 19.10.2026
          // упирался в «База не открыта» без причины — что именно не открылось и почему.
          db: getDbState(),
          // Какой OTA-бандл реально работает (Фаза 21): без этого нельзя понять,
          // доехало ли исправление до устройства (отчёт 21.10.2026: `lastPullRecords: 0`
          // при неясном наборе правок).
          bundle: updateService.getStatus()?.currentBundleId || null,
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

    try {
      await feedbackRepo.enqueue({
        id,
        kind: report.kind,
        message: report.message,
        payload: report,
      })

      logger.log(`[Feedback] Отчёт ${id} сохранён локально (${report.kind})`)
    } catch (error) {
      // Локальная БД не открылась (Фаза 21): отчёт об этой поломке обязан уйти.
      // Раньше `enqueue` падал с `[SQLITE] База не открыта`, и мастер не мог
      // сообщить ни о чём — канал обратной связи ломался вместе с базой.
      feedbackOutbox.add({
        id,
        kind: report.kind,
        message: report.message,
        payload: report,
      })

      logger.warn(
        '[Feedback] Локальная БД недоступна — отчёт ждёт отправки в резервной очереди:',
        error?.message || error
      )
    }

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

    // Идёт полный сброс локальной БД (смена аккаунта): очередь отчётов сейчас удаляется,
    // поэтому статусы в неё писать нельзя, а чужие отчёты уезжать не должны.
    if (syncService.isResetting()) {
      logger.log('[Feedback] Идёт полный сброс локальных данных — отправка отчётов отложена')
      return state
    }

    // ⚠️ Гейта «WebView считает, что офлайн» здесь нет: флаг залипает (дефект 14.11),
    // и тогда отчёты не уходили бы вовсе. Пробуем отправить, а сетевой сбой ниже сам
    // останавливает проход — недоступный сервер мы не «долбим».
    const records = await this._pendingRecords()

    for (const record of records) {
      // Без входа отправлять некуда: отчёт дождётся входа, как очередь синка (7.4).
      if (!hasAuthToken()) break

      // Сеть только что упала: не долбим её чаще, чем раз в паузу (14.36).
      // Проверка «система говорит, что сеть есть» живёт внутри `_shouldWait`.
      if (this._shouldWait(record.id)) break

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

    state.pending = await this.pendingCount()

    return state
  }

  /**
   * Все отчёты, ждущие отправки: основная очередь в SQLite + резервная в
   * `localStorage`.
   *
   * Записи из резервной очереди помечаются `_outbox: true`, чтобы `_send()` знал,
   * куда писать статус. Если SQLite не открыт, `feedbackRepo` просто не читается —
   * отчёты всё равно уедут.
   *
   * @returns {Promise<Array<object>>}
   */
  async _pendingRecords() {
    let stored = []

    try {
      stored = await feedbackRepo.listPending()
    } catch (error) {
      logger.warn('[Feedback] Очередь отчётов в БД недоступна:', error?.message || error)
    }

    const memory = feedbackOutbox
      .list()
      // `sending` тоже берём: приложение могло закрыться между запросом и ответом,
      // и отчёт иначе «завис» бы в резервной очереди навсегда.
      .filter(record => record.status === 'pending' || record.status === 'sending')
      .map(record => ({ ...record, _outbox: true }))

    return [...stored, ...memory]
  }

  /** Сколько отчётов ждёт отправки (для подписи под кнопкой в настройках). */
  async pendingCount() {
    let stored = 0

    try {
      stored = await feedbackRepo.countPending()
    } catch (error) {
      logger.warn('[Feedback] Не удалось прочитать очередь отчётов:', error?.message || error)
    }

    return stored + feedbackOutbox.count()
  }

  /** Вся очередь отчётов для диагностики и тестов (в UI не показывается — правка владельца
   *  17.09.2026: из диалога «Сообщить об ошибке» список последних отчётов убран). */
  async listAll() {
    let stored = []

    try {
      stored = await feedbackRepo.listAll()
    } catch (error) {
      logger.warn('[Feedback] Не удалось прочитать историю отчётов:', error?.message || error)
    }

    return [...stored, ...feedbackOutbox.list().map(record => ({ ...record, _outbox: true }))]
  }

  /** Статусные записи: для отчёта из резервной очереди — в localStorage, иначе в БД. */
  async _markSending(record) {
    if (record._outbox) {
      feedbackOutbox.update(record.id, { status: 'sending' })
      return
    }

    await feedbackRepo.markSending(record.id)
  }

  async _markSent(record, serverId = null) {
    if (record._outbox) {
      feedbackOutbox.remove(record.id)
      return
    }

    await feedbackRepo.markSent(record.id, serverId)
  }

  async _markFailed(record, message = null) {
    if (record._outbox) {
      feedbackOutbox.update(record.id, { status: 'failed', lastError: message ? String(message) : null })
      return
    }

    await feedbackRepo.markFailed(record.id, message)
  }

  async _markPending(record, message = null, attempts = null) {
    if (record._outbox) {
      feedbackOutbox.update(record.id, {
        status: 'pending',
        lastError: message ? String(message) : null,
        attempts: attempts ?? record.attempts ?? 0,
      })
      return
    }

    await feedbackRepo.markPending(record.id, message)
  }

  async _send(record) {
    await this._markSending(record)

    let payload

    try {
      payload = JSON.parse(record.payload)
    } catch {
      await this._markFailed(record, 'Битый payload отчёта')
      return 'failed'
    }

    const attempts = Number(record.attempts || 0) + 1

    try {
      const response = await apiClient.post('/feedback', payload)
      await this._markSent(record, response?.data?.server_id ?? null)
      logger.log(`[Feedback] Отчёт ${record.id} принят сервером`)
      return 'sent'
    } catch (error) {
      const message = this._errorText(error)
      const status = error?.response?.status
      const seenByServer = status != null

      // «Сдаёмся» только на ответах сервера: неисправимые 4xx — сразу, прочие 4xx
      // (408/429) — после лимита. Сеть (ответа нет) и 5xx остаются в очереди
      // навсегда: отчёт мастера не теряется (дефект 14.36).
      const exhausted =
        seenByServer && status >= 400 && status < 500 && attempts >= MAX_FEEDBACK_ATTEMPTS

      if (this._isPermanent(error) || exhausted) {
        logger.warn(`[Feedback] Отчёт ${record.id} не будет отправлен: ${message}`)
        this._retryAfter.delete(record.id)
        await this._markFailed(record, message)
        return 'failed'
      }

      logger.warn(`[Feedback] Отчёт ${record.id} остался в очереди: ${message}`)
      await this._markPending(record, message, attempts)
      this._scheduleRetry(record.id, attempts)

      return 'pending'
    }
  }

  /**
   * Откладывает следующую попытку отчёта: пауза растёт от 15 с до 5 мин (14.36).
   *
   * @param {string} id
   * @param {number} attempts номер только что провалившейся попытки
   */
  _scheduleRetry(id, attempts) {
    const index = Math.min(Math.max(attempts, 1) - 1, RETRY_BACKOFF_MS.length - 1)

    this._retryAfter.set(id, Date.now() + RETRY_BACKOFF_MS[index])
  }

  /**
   * Пора ли пробовать отчёт снова. Пауза не действует, когда платформа сообщает
   * «сеть есть»: залипший `onLine` (дефект 14.11) тогда не задержит отправку.
   *
   * @param {string} id
   */
  _shouldWait(id) {
    if (typeof navigator !== 'undefined' && navigator.onLine === true) return false

    const after = this._retryAfter.get(id)

    return after != null && after > Date.now()
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
        // Сеть вернулась — паузы офлайна больше не действуют, пробуем сразу.
        this._retryAfter.clear()
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
    this._retryAfter.clear()
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

