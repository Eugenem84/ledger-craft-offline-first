// test/sync-status-view.test.js
//
// Задача 6.2: представление состояния синка для индикатора — чистая функция
// `src/utils/syncStatusView.js`. Проверяем приоритет состояний: интерфейс должен
// показывать самую важную причину (нет сети важнее ошибки, ошибка важнее очереди).
import { describe, it, expect } from 'vitest'
import { syncStatusView } from 'src/utils/syncStatusView.js'

describe('6.2 представление состояния синка', () => {
  it('нет интернета — высший приоритет', () => {
    const view = syncStatusView({
      online: false,
      syncing: true,
      lastError: 'Network Error',
      pendingCount: 3,
    })

    expect(view).toMatchObject({ kind: 'offline', icon: 'cloud_off' })
    expect(view.label).toBe('нет интернета')
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

  it('всё синхронизировано', () => {
    const view = syncStatusView({ online: true, syncing: false, lastError: null, pendingCount: 0 })

    expect(view).toMatchObject({ kind: 'synced', icon: 'cloud_done', spin: false })
  })

  it('неполное состояние не роняет индикатор', () => {
    expect(syncStatusView().kind).toBe('synced')
    expect(syncStatusView({ pendingCount: '2' }).label).toBe('не отправлено: 2')
  })
})
