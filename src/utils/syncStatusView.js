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
// Здесь же живёт всё, что показывает и объясняет значок в шапке (задача 14.33):
// `syncStatusDetails` — текст для тултипа и диалога, `syncStatusActions` — кнопки
// диалога, `syncStatusNeedsAttention` — «тап открывает диалог», `syncStatusOutcome` —
// итог ручной синхронизации. Компоненты (`SyncStatusBar`, `SyncStatusDialog`) только
// рендерят результат этих функций.
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

/**
 * Подробности состояния — построчно, для диалога по тапу на значок (задача 14.33).
 *
 * Почему диалог, а не тултип: на телефоне тултип не показывается (у чипа нет наведения),
 * поэтому живой отчёт мастера 16.10.2026 (боевой контур) звучал так: «горит красным
 * треугольник и ничего не выдаёт при нажатии». Тот же текст, что был в тултипе, теперь
 * доступен по тапу — и его видно целиком (без ограничения ширины подсказки).
 *
 * @param {{online?: boolean, syncing?: boolean, lastError?: string|null, pendingCount?: number,
 *   failedCount?: number, blockedCount?: number, requiresAuth?: boolean, nextRetryAt?: number}} status
 * @param {number} [now] «сейчас» — параметром, чтобы текст о паузе проверялся тестом
 * @returns {Array<string>}
 */
export function syncStatusDetails(status, now = Date.now()) {
  const s = status || {}
  const lines = []

  if (s.requiresAuth) {
    lines.push('Нужен вход в аккаунт — синхронизация недоступна.')
  }
  if (s.online === false) {
    lines.push('Нет подключения к интернету — изменения сохраняются локально.')
  }

  const pending = Number(s.pendingCount) || 0
  const failed = Number(s.failedCount) || 0
  const blocked = Number(s.blockedCount) || 0

  if (pending > 0) {
    lines.push(`Ждут отправки: ${pending}`)
  }
  if (failed > 0) {
    lines.push(`Не удалось отправить: ${failed} — сами они не повторятся, нажмите «Повторить отправку».`)
  }
  if (blocked > 0) {
    lines.push(`Ждут записи, которой нет на сервере: ${blocked} — нажмите «Починить очередь».`)
  }
  if (s.lastError) {
    lines.push(`Последняя ошибка: ${s.lastError}`)
  }

  const waitMs = (Number(s.nextRetryAt) || 0) - now
  if (waitMs > 0) {
    lines.push(`Повтор через ${Math.ceil(waitMs / 1000)} с`)
  }
  if (!lines.length) {
    lines.push('Все изменения синхронизированы.')
  }

  return lines
}

/**
 * Кнопки для диалога синка: что мастер может сделать сам, не заходя в «Режим
 * разработчика». Раньше единственным лечением «сдавшихся» и «заблокированных»
 * операций была отладочная панель — то есть мастер не мог ничего (задача 14.33).
 *
 * @param {object} status
 * @returns {Array<{key: string, label: string, color: string}>}
 */
export function syncStatusActions(status) {
  const s = status || {}

  if (s.requiresAuth === true) {
    return [{ key: 'login', label: 'Войти', color: 'secondary' }]
  }

  const actions = []

  if ((Number(s.failedCount) || 0) > 0) {
    actions.push({ key: 'retry', label: 'Повторить отправку', color: 'secondary' })
  }
  if ((Number(s.blockedCount) || 0) > 0) {
    actions.push({ key: 'repair', label: 'Починить очередь', color: 'warning' })
  }

  actions.push({ key: 'sync', label: 'Синхронизировать', color: 'secondary' })

  return actions
}

/**
 * Нужно ли мастеру объяснение: тап по значку открывает диалог, а не молчаливый
 * повтор синка (живой отчёт 16.10.2026).
 *
 * «Всё в порядке» (`pending`/`syncing`/`synced`/`offline`) объяснять нечем — там тап
 * остаётся привычным «синхронизировать сейчас» и заканчивается всплывающим итогом.
 *
 * @param {object} status
 * @returns {boolean}
 */
export function syncStatusNeedsAttention(status) {
  return ['failed', 'blocked', 'error'].includes(syncStatusView(status).kind)
}

/**
 * Короткий итог ручной синхронизации: тап по значку должен что-то **сказать** —
 * молчание и было жалобой мастера (задача 14.33).
 *
 * @param {object} status снимок после синка (`syncService.getStatus()`)
 * @returns {{type: string, message: string}}
 */
export function syncStatusOutcome(status) {
  const s = status || {}
  const failed = Number(s.failedCount) || 0
  const pending = Number(s.pendingCount) || 0

  if (s.requiresAuth === true) {
    return { type: 'warning', message: 'Нужен вход в аккаунт — синхронизация недоступна.' }
  }
  if (s.online === false) {
    return { type: 'warning', message: 'Нет сети — изменения сохранены на телефоне.' }
  }
  if (failed > 0) {
    return { type: 'warning', message: `Не удалось отправить: ${failed} — сами они не повторятся.` }
  }
  if (s.lastError) {
    return { type: 'warning', message: `Ошибка синка: ${s.lastError}` }
  }
  if (pending > 0) {
    return { type: 'info', message: `Осталось отправить: ${pending}` }
  }

  return { type: 'positive', message: 'Изменения синхронизированы.' }
}
