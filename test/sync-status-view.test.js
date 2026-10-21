// test/sync-status-view.test.js
//
// Задача 6.2: представление состояния синка для индикатора — чистая функция
// `src/utils/syncStatusView.js`. Проверяем приоритет состояний: интерфейс должен
// показывать самую важную причину (нет сети важнее ошибки, ошибка важнее очереди).
import { describe, it, expect } from 'vitest'
import {
  syncStatusActions,
  syncStatusDetails,
  syncStatusNeedsAttention,
  syncStatusOutcome,
  syncStatusView,
} from 'src/utils/syncStatusView.js'

describe('6.2 представление состояния синка', () => {
  it('требуется вход — важнее офлайна и очереди (7.4)', () => {
    const view = syncStatusView({ requiresAuth: true, online: false, pendingCount: 4 })

    expect(view).toMatchObject({ kind: 'auth', icon: 'lock' })
    expect(view.label).toBe('требуется вход')
  })

  it('нет сети — высший приоритет', () => {
    const view = syncStatusView({
      online: false,
      syncing: true,
      lastError: 'Network Error',
      pendingCount: 3,
    })

    expect(view).toMatchObject({ kind: 'offline', icon: 'cloud_off', color: 'warning' })
    expect(view.label).toBe('нет сети')
  })

  it('идёт синхронизация — спиннер', () => {
    const view = syncStatusView({ online: true, syncing: true, pendingCount: 3 })

    expect(view.kind).toBe('syncing')
    expect(view.spin).toBe(true)
    expect(view.label).toBe('синхронизация…')
  })

  it('ошибка синка важнее непустой очереди', () => {
    const view = syncStatusView({ online: true, syncing: false, lastError: 'Server Error', pendingCount: 2 })

    expect(view).toMatchObject({ kind: 'error', icon: 'sync_problem' })
  })

  it('очередь не пуста — показываем количество', () => {
    const view = syncStatusView({ online: true, syncing: false, lastError: null, pendingCount: 5 })

    expect(view).toMatchObject({ kind: 'pending', icon: 'cloud_upload' })
    expect(view.label).toBe('не отправлено: 5')
  })

  it('«сдавшиеся» операции важнее общей ошибки и очереди (12/11.6)', () => {
    const view = syncStatusView({
      online: true,
      syncing: false,
      lastError: 'Server Error',
      pendingCount: 3,
      failedCount: 2,
    })

    expect(view).toMatchObject({ kind: 'failed', icon: 'report_problem', color: 'negative' })
    expect(view.label).toBe('не отправлено: 2')
  })

  it('без «сдавшихся» поведение прежнее', () => {
    const view = syncStatusView({ online: true, syncing: false, lastError: null, pendingCount: 1, failedCount: 0 })

    expect(view.kind).toBe('pending')
  })

  it('всё синхронизировано', () => {
    const view = syncStatusView({ online: true, syncing: false, lastError: null, pendingCount: 0 })

    expect(view).toMatchObject({ kind: 'synced', icon: 'cloud_done', spin: false })
  })

  it('неполное состояние не роняет индикатор', () => {
    expect(syncStatusView().kind).toBe('synced')
    expect(syncStatusView({ pendingCount: '2' }).label).toBe('не отправлено: 2')
  })
})

// Живой отчёт мастера 16.10.2026 (боевой контур): «на вкладке заказ в правом верхнем
// углу горит красным треугольник и ничего не выдаёт при нажатии». Значок был «только
// значком»: объяснение жило в тултипе (на телефоне наведения нет), а тап запускал синк,
// который «сдавшиеся» операции не отправляет — поэтому визуально не происходило ничего.
// Теперь объяснение, кнопки и итог тапа описаны чистыми функциями — их и проверяем.
describe('14.33 значок синка объясняет себя (диалог, кнопки, итог)', () => {
  it('подробности перечисляют всё, что важно мастеру, включая причины и паузу', () => {
    const now = 1_000_000
    const lines = syncStatusDetails(
      {
        online: false,
        pendingCount: 2,
        failedCount: 1,
        blockedCount: 3,
        lastError: 'Network Error',
        nextRetryAt: now + 5000,
      },
      now
    )
    const text = lines.join('\n')

    expect(text).toContain('Нет подключения к интернету')
    expect(text).toContain('Ждут отправки: 2')
    expect(text).toContain('Не удалось отправить: 1')
    expect(text).toContain('Повторить отправку')
    expect(text).toContain('Ждут записи, которой нет на сервере: 3')
    expect(text).toContain('Починить очередь')
    expect(text).toContain('Последняя ошибка: Network Error')
    expect(text).toContain('Повтор через 5 с')
  })

  it('без проблем подробности простые — диалог не пугает', () => {
    expect(syncStatusDetails({ online: true, pendingCount: 0 })).toEqual([
      'Все изменения синхронизированы.',
    ])
    expect(syncStatusDetails({ requiresAuth: true }, 0)).toContain(
      'Нужен вход в аккаунт — синхронизация недоступна.'
    )
  })

  it('диалог открывается только там, где есть что объяснять', () => {
    expect(syncStatusNeedsAttention({ online: true, failedCount: 1 })).toBe(true)
    expect(syncStatusNeedsAttention({ online: true, blockedCount: 1 })).toBe(true)
    expect(syncStatusNeedsAttention({ online: true, lastError: 'Server Error' })).toBe(true)

    // Обычные состояния — привычный «синхронизировать сейчас».
    expect(syncStatusNeedsAttention({ online: true, pendingCount: 3 })).toBe(false)
    expect(syncStatusNeedsAttention({ online: false, pendingCount: 3 })).toBe(false)
    expect(syncStatusNeedsAttention({ online: true, syncing: true })).toBe(false)
    expect(syncStatusNeedsAttention({ online: true })).toBe(false)
  })

  it('кнопки: повтор отправки и починка очереди; без входа — только «Войти»', () => {
    expect(syncStatusActions({ failedCount: 1 }).map(action => action.key)).toEqual(['retry', 'sync'])
    expect(syncStatusActions({ blockedCount: 2 }).map(action => action.key)).toEqual(['repair', 'sync'])
    expect(syncStatusActions({ failedCount: 1, blockedCount: 2 }).map(action => action.key)).toEqual([
      'retry',
      'repair',
      'sync',
    ])
    expect(syncStatusActions({ requiresAuth: true, failedCount: 1 }).map(action => action.key)).toEqual([
      'login',
    ])
  })

  it('ручной синк всегда заканчивается словами (молчание и было жалобой)', () => {
    expect(syncStatusOutcome({ online: true, pendingCount: 0, failedCount: 0 })).toEqual({
      type: 'positive',
      message: 'Изменения синхронизированы.',
    })
    expect(syncStatusOutcome({ online: false }).message).toContain('Нет сети')
    expect(syncStatusOutcome({ online: true, failedCount: 2 }).message).toBe(
      'Не удалось отправить: 2 — сами они не повторятся.'
    )
    expect(syncStatusOutcome({ online: true, lastError: 'Server Error' }).message).toContain(
      'Server Error'
    )
    expect(syncStatusOutcome({ online: true, pendingCount: 4 }).message).toBe('Осталось отправить: 4')
  })
})

describe('21.6 индикатор синка: «база не открыта»', () => {
  it('состояние БД важнее остальных: не «синхронизировано»', () => {
    const view = syncStatusView({ dbError: true, online: true, pendingCount: 0 })

    expect(view).toMatchObject({ kind: 'db', icon: 'storage', color: 'negative', spin: false })
    expect(view.label).toBe('база не открыта')
    expect(syncStatusNeedsAttention({ dbError: true })).toBe(true)
  })

  it('диалог объясняет, что делать, и не требует «лишних кнопок»', () => {
    const text = syncStatusDetails({ dbError: true }).join('\n')

    expect(text).toContain('Локальная база данных не открылась')
    expect(text).toContain('установите его заново')
    expect(text).toContain('база для этого больше не нужна')
    expect(syncStatusActions({ dbError: true }).map(action => action.key)).toEqual(['sync'])
    expect(syncStatusOutcome({ dbError: true }).message).toContain('перезапустите приложение')
  })
})

