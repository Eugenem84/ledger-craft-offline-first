// src/utils/syncStatusView.js
//
// Представление состояния синка для индикатора (задача 6.2).
//
// Это чистая функция без Vue и Quasar: компонент `SyncStatusBar.vue` остаётся «тонким»,
// а приоритет состояний проверяется обычным юнит-тестом (`test/sync-status-view.test.js`).
//
// Приоритет (сверху вниз): требуется вход → нет сети → идёт синхронизация →
// «сдавшиеся» операции → ошибка → очередь не пуста → всё синхронизировано. Так
// пользователь видит самую важную причину текущего состояния.
//
// Подпись «нет сети» намеренно короткая: чип живёт в шапке (`MainLayout`) и должен
// оставаться компактным даже на узком экране (задача UX).

/**
 * @param {{online?: boolean, syncing?: boolean, lastError?: string|null, pendingCount?: number,
 *   failedCount?: number, requiresAuth?: boolean}} status
 * @returns {{kind: string, icon: string, color: string, label: string, spin: boolean}}
 */
export function syncStatusView(status) {
  const s = status || {}

  // Без входа синк невозможен даже при сети (задача 7.4) — это самое важное
  // состояние, поэтому проверяем его первым.
  if (s.requiresAuth === true) {
    return { kind: 'auth', icon: 'lock', color: 'secondary', label: 'требуется вход', spin: false }
  }

  if (s.online === false) {
    // Цвет — «внимание» (янтарный), а не красный: офлайн-первое приложение в офлайне
    // работает штатно, изменения копятся локально. Красный в палитре один и означает
    // именно проблему («ошибка синка», «не удалось отправить»), поэтому раньше оранжевый
    // `deep-orange` давал пятый оттенок, почти неотличимый от красного (правка владельца
    // 15.09.2026: цвета приложения сведены к четырём ролям + серым).
    return { kind: 'offline', icon: 'cloud_off', color: 'warning', label: 'нет сети', spin: false }
  }

  if (s.syncing) {
    return { kind: 'syncing', icon: 'sync', color: 'secondary', label: 'синхронизация…', spin: true }
  }

  // «Сдавшиеся» операции важнее общей ошибки: они уже не уедут сами и требуют
  // действия (Фаза 12, дефект живого прогона 11.6).
  const failed = Number(s.failedCount) || 0

  if (failed > 0) {
    return {
      kind: 'failed',
      icon: 'report_problem',
      color: 'negative',
      label: `не отправлено: ${failed}`,
      spin: false,
    }
  }

  // «Заблокированные» ждут родителя, которого нет на сервере (дефект 14.11):
  // сами они не уедут — нужна «Починка очереди» в «Режиме разработчика».
  const blocked = Number(s.blockedCount) || 0

  if (blocked > 0) {
    return {
      kind: 'blocked',
      icon: 'build_circle',
      color: 'warning',
      label: `нужна починка: ${blocked}`,
      spin: false,
    }
  }

  if (s.lastError) {
    return { kind: 'error', icon: 'sync_problem', color: 'negative', label: 'ошибка синка', spin: false }
  }

  const pending = Number(s.pendingCount) || 0

  if (pending > 0) {
    return { kind: 'pending', icon: 'cloud_upload', color: 'warning', label: `не отправлено: ${pending}`, spin: false }
  }

  return { kind: 'synced', icon: 'cloud_done', color: 'positive', label: 'синхронизировано', spin: false }
}
