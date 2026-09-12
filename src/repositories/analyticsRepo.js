// src/repositories/analyticsRepo.js
//
// Читающий репозиторий аналитики (задача 9.1). Только `SELECT`: ничего не пишет
// и не ставит операций в очередь синка — поэтому и не участвует в `syncService`.
//
// Считаем по локальной БД (офлайн-первый подход): страница аналитики работает без
// сети, а цифры совпадают с серверными отчётами, потому что методика одна
// (см. `src/database/queries/analytics.js` и `src/utils/analytics.js`).
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/analytics.js'

/** Сколько позиций показываем в топах (как на сервере — `StatisticRepository::TOP_LIMIT`). */
export const TOP_LIMIT = 10

/**
 * Заказы мастерской с готовой выручкой по позициям — основа всех расчётов страницы.
 * @param {string} specializationId
 */
export async function getOrders(specializationId) {
  return dbAdapter.query(queries.ordersWithRevenue, [specializationId])
}

/** Топ работ за период (`from`/`to` — UNIX-секунды локального времени). */
export async function getTopServices(specializationId, from, to) {
  return dbAdapter.query(queries.topServices, [specializationId, from, to, TOP_LIMIT])
}

/** Топ товаров со склада за период. */
export async function getTopProducts(specializationId, from, to) {
  return dbAdapter.query(queries.topProducts, [specializationId, from, to, TOP_LIMIT])
}

/** Топ ручных позиций за период. */
export async function getTopMaterials(specializationId, from, to) {
  return dbAdapter.query(queries.topMaterials, [specializationId, from, to, TOP_LIMIT])
}
