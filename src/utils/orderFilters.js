// src/utils/orderFilters.js
//
// Фильтр списка заказов (страница «заказы»). Чистые функции — проверяются тестами
// без DOM (см. `test/orders-filter.test.js`).
//
// Тумблер «показывать готовые и оплаченные»: когда он ВЫКЛЮЧЕН, из списка уходят
// только заказы, у которых выполнены **оба** условия — статус «готово» И оплата.
//
// ⚠️ Дефект живого прогона (11.6): раньше стояло `order.paid === false`, но в БД
// `paid` — это целое 0/1 (см. `useOrdersStore`/`mappers/orders.js`), поэтому
// `0 === false` не срабатывало и неоплаченный «готовый» заказ пропадал из списка.

/**
 * Оплачен ли заказ. Терпимо к `1`/`'1'`/`true` — так значение приходит из БД,
 * стора и серверной выдачи.
 * @param {object} order
 * @returns {boolean}
 */
export function isOrderPaid(order) {
  if (!order) return false
  return order.paid === true || Number(order.paid) === 1
}

/** Заказ выполнен (статус «готово»). */
export function isOrderDone(order) {
  return order?.status === 'done'
}

/**
 * Оставить ли заказ в списке. Прячем только «готово И оплачено».
 *
 * @param {object} order
 * @param {boolean} showCompleted тумблер «показывать готовые и оплаченные»
 * @returns {boolean}
 */
export function isOrderVisible(order, showCompleted) {
  if (showCompleted) return true
  return !(isOrderDone(order) && isOrderPaid(order))
}
