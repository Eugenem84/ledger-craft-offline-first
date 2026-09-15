// src/utils/formatDate.js
//
// Подпись даты для движений склада и истории (правка владельца 15.09.2026: вкладка
// «движение товаров» и карточка товара показывают даты одной строкой).
//
// Формат тот же, что в списке ордеров (`OrdersPage.formatDate`): «12 сентября»,
// а если год не текущий — ещё и двухзначный год («12 сентября 25»). Держим отдельной
// утилитой, чтобы история склада не заводила себе третий формат даты.

const RU_MONTH_DAY = { day: '2-digit', month: 'long' }

/**
 * Дата из UNIX-секунд (`created_at` локальной БД) короткой подписью.
 *
 * @param {unknown} seconds секунды (или мс — приводим), пусто/мусор → «—»
 * @param {Date} [now] «сейчас» — для тестов
 * @returns {string} «12 сентября» / «12 сентября 25» / «—»
 */
export function formatDayLabel(seconds, now = new Date()) {
  const stamp = Number(seconds)
  if (!Number.isFinite(stamp) || stamp <= 0) return '—'

  // Локальные даты — секунды; страховка на миллисекунды (например, значение из теста).
  const date = new Date(stamp > 1e11 ? stamp : stamp * 1000)
  if (Number.isNaN(date.getTime())) return '—'

  const formatted = date.toLocaleDateString('ru-RU', RU_MONTH_DAY)

  return date.getFullYear() === now.getFullYear()
    ? formatted
    : `${formatted} ${String(date.getFullYear()).slice(-2)}`
}
