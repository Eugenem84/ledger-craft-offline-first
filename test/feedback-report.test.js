// test/feedback-report.test.js
//
// Фаза 14, задача 14.3: чистая сборка отчёта «Сообщить об ошибке» и приватность.
//
// Главная проверка — **закрытый список полей**: отчёт собирается поле за полем, поэтому
// данные мастерской (заказы, клиенты, суммы, телефоны) в него не попадают по построению,
// а не «по договорённости». Плюс лимиты: текст, хвост ошибок и логи обрезаются.
import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_FIELDS,
  FEEDBACK_LOGS_LIMIT,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  buildFeedbackReport,
  canSubmitFeedback,
  clipText,
  feedbackStatusView,
  feedbackTextFromReport,
  limitEntries,
  normalizeKind,
} from 'src/utils/feedbackView.js'

const CREATED_AT = Date.UTC(2026, 8, 13, 20, 11, 3)

function makeReport(overrides = {}) {
  return buildFeedbackReport({
    uuidId: 'b7f1c0de-1111-2222-3333-444455556666',
    kind: 'bug',
    message: '  кнопка «сохранить» ничего не делает  ',
    contact: 'мастер@example.com',
    screen: '/orders/42',
    diagnostics: {
      appVersion: '1.1 (2)',
      platform: 'android',
      platformVersion: 'Android 13',
      apiUrl: 'https://dev.example/api',
      schemaVersion: 30,
      schemaStored: 30,
      account: 'master@example.com',
      profile: 'Велосервис',
      sync: { online: false, pendingCount: 3, lastError: 'Network Error', лишнее: 'не берём' },
    },
    errors: [{ time: '2026-09-13T20:10:00.000Z', level: 'error', message: 'boom' }],
    logs: [{ time: '2026-09-13T20:10:01.000Z', level: 'log', message: 'шаг 1' }],
    createdAt: CREATED_AT,
    ...overrides,
  })
}

describe('14.3 отчёт «Сообщить об ошибке»: контракт и приватность', () => {
  it('собирает ровно поля контракта — без данных мастерской', () => {
    const report = makeReport()
    const serialized = JSON.stringify(report)

    expect(Object.keys(report).sort()).toEqual([...FEEDBACK_FIELDS].sort())

    // Ничего «лишнего» в sync (например, объектов состояния), ни данных заказов/клиентов.
    expect(Object.keys(report.sync).sort()).toEqual([
      'consecutiveFailures',
      'failedCount',
      'lastError',
      'online',
      'pendingCount',
    ])
    expect(serialized).not.toContain('лишнее')
    expect(serialized).not.toContain('client_id')
    expect(serialized).not.toContain('client_name')
    expect(serialized).not.toContain('phone')
    expect(serialized).not.toContain('order_id')
    expect(report.message).toBe('кнопка «сохранить» ничего не делает')
    expect(report.client_created_at).toBe('2026-09-13T20:11:03.000Z')
  })

  it('обрезает текст мастера, контакт и сообщения логов', () => {
    const report = makeReport({ message: 'я'.repeat(FEEDBACK_MESSAGE_MAX + 500) })

    expect(report.message).toHaveLength(FEEDBACK_MESSAGE_MAX)
    expect(clipText('abcdef', 5)).toBe('abcd…')
    expect(clipText(null)).toBe('')
  })

  it('хвосты ошибок и логов ограничены, сообщения обрезаны', () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      time: '',
      level: 'error',
      message: `ошибка ${index}`,
    }))

    expect(limitEntries(many, FEEDBACK_LOGS_LIMIT)).toHaveLength(FEEDBACK_LOGS_LIMIT)
    // Берём последние записи, а не первые.
    expect(limitEntries(many, 2).map(entry => entry.message)).toEqual(['ошибка 118', 'ошибка 119'])
    expect(limitEntries([{ message: 'x'.repeat(900) }], 1)[0].message).toHaveLength(500)
    expect(limitEntries(null)).toEqual([])
  })

  it('canSubmitFeedback объясняет, почему текст не годится', () => {
    expect(canSubmitFeedback('ok!').ok).toBe(true)
    expect(canSubmitFeedback('a').reason).toContain(String(FEEDBACK_MESSAGE_MIN))
    expect(canSubmitFeedback('я'.repeat(FEEDBACK_MESSAGE_MAX + 1)).ok).toBe(false)
  })

  it('неизвестный тип отчёта приводится к «ошибке», а не теряется', () => {
    expect(normalizeKind('magic')).toBe('bug')
    expect(makeReport({ kind: 'magic' }).kind).toBe('bug')
  })

  it('feedbackStatusView даёт подписи для всех статусов очереди', () => {
    expect(feedbackStatusView('pending').label).toBe('в очереди')
    expect(feedbackStatusView('sending').label).toBe('отправляется')
    expect(feedbackStatusView('sent', { serverId: 7 }).hint).toContain('7')
    expect(feedbackStatusView('failed', { lastError: 'нужен вход' }).hint).toBe('нужен вход')
  })

  it('feedbackTextFromReport даёт текст для копирования в буфер', () => {
    const text = feedbackTextFromReport(makeReport())

    expect(text).toContain('## отчёт: Ошибка')
    expect(text).toContain('## окружение')
    expect(text).toContain('## синхронизация')
    expect(text).toContain('## ошибки (1)')
    expect(text).toContain('boom')
    expect(feedbackTextFromReport(null)).toBe('')
  })
})
