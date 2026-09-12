// src/utils/syncStatusView.js
//
// Представление состояния синка для индикатора (задача 6.2).
//
// Это чистая функция без Vue и Quasar: компонент `SyncStatusBar.vue` остаётся «тонким»,
// а приоритет состояний проверяется обычным юнит-тестом (`test/sync-status-view.test.js`).
//
// Приоритет (сверху вниз): нет интернета → идёт синхронизация → ошибка → очередь не пуста
// → всё синхронизировано. Так пользователь видит самую важную причину текущего состояния.

/**
 * @param {{online?: boolean, syncing?: boolean, lastError?: string|null, pendingCount?: number}} status
 * @returns {{kind: string, icon: string, color: string, label: string, spin: boolean}}
 */
export function syncStatusView(status) {
  const s = status || {}

  if (s.online === false) {
    return { kind: 'offline', icon: 'cloud_off', color: 'deep-orange', label: 'нет интернета', spin: false }
  }

  if (s.syncing) {
    return { kind: 'syncing', icon: 'sync', color: 'primary', label: 'синхронизация…', spin: true }
  }

  if (s.lastError) {
    return { kind: 'error', icon: 'sync_problem', color: 'negative', label: 'ошибка синка', spin: false }
  }

  const pending = Number(s.pendingCount) || 0

  if (pending > 0) {
    return { kind: 'pending', icon: 'cloud_upload', color: 'orange', label: `не отправлено: ${pending}`, spin: false }
  }

  return { kind: 'synced', icon: 'cloud_done', color: 'green', label: 'синхронизировано', spin: false }
}
