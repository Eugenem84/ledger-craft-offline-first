// src/utils/quantity.js
//
// Количество позиции заказа (задача 14.19). Работа не может быть «выполнена −3 раза»,
// а колесо — «2.5 штуки»: количество везде — **целое ≥ 1**. Правило живёт в одном месте
// и применяется на всех границах: поле ввода → черновик → локальная БД → payload синка
// (поэтому отрицательное или дробное значение не может доехать ни до сервера, ни до
// аналитики на другом устройстве).

/**
 * Целое ≥ 1 — значение для хранения и отправки.
 * Пусто/`0`/отрицательное/дробное/мусор → 1; `2.9` → 2; `-3` → 1.
 *
 * @param {unknown} value значение из поля ввода или строки БД
 * @returns {number}
 */
export function normalizeQuantity(value) {
  const quantity = Math.trunc(Number(value))

  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

/**
 * Значение для поля ввода: то же правило, но **пустое поле остаётся пустым**.
 * Иначе нельзя стереть цифру и набрать новую — поле мгновенно «прыгало» бы на 1.
 * Пустое значение нормализуется в 1 на сохранении (`normalizeQuantity`) и при подсчёте
 * итогов.
 *
 * @param {unknown} value
 * @returns {number|string}
 */
export function normalizeQuantityInput(value) {
  if (value === '' || value == null) return ''

  return normalizeQuantity(value)
}
