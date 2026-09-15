// src/repositories/stockHistoryRepo.js
//
// История склада (правка владельца 15.09.2026). Только чтение: ничего не пишет и не
// ставит операций в очередь синка — приходы и расходы уже лежат в локальных таблицах
// (`incoming_products`, `order_product`), а этот репозиторий складывает их в один
// список «движений». Запись живёт там, где ей место: приход — `incomingProductsRepo`,
// строки заказа — `orderProductRepo`/`materialsRepo`.
//
// Единица измерения — движение: приход (`kind: 'in'`, знак «+») или расход
// (`kind: 'out'`, знак «−»). Складывать их в одну ленту честнее, чем показывать
// двумя списками: мастер сразу видит, куда ушёл товар и что пришло.
//
// Два режима чтения: история одного товара (`getByProductId` — карточка товара) и
// история всех товаров профиля (`getAll` — вкладка «история перемещений» на складе).
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/stockHistory.js'
import { resolveScopeKeys } from 'src/repositories/specializationsRepo.js'

/**
 * Сколько движений отдаём во вкладку «история перемещений»: страница не должна
 * тормозить на мастерской с многолетней историей. Показываем свежие, старые —
 * в карточке конкретного товара (там полная история без лимита).
 */
export const HISTORY_LIMIT = 200

/** Метка строки заказа: человеческий номер, если сервер его выдал. */
export function orderLabel(row) {
  return row?.user_order_number ? `ордер №${row.user_order_number}` : 'продажа по ордеру'
}

/**
 * Складывает строки приходов и расходов в один список движений (чистая функция —
 * покрывается юнит-тестом).
 *
 * @param {{arrivals?: object[], expenses?: object[]}} rows
 * @returns {Array<{id: string, arrivalId: string, productId: string|null,
 *   productName: string, kind: 'in'|'out', quantity: number, price: number,
 *   supplier: string, synced: boolean, createdAt: number, title: string}>}
 *   движения, новые сверху
 */
export function toMovements({ arrivals = [], expenses = [] } = {}) {
  const incoming = arrivals.map(row => ({
    id: `in-${row.id}`,
    // Локальный id прихода — им правится строка истории (`EditArrivalDialogPage`).
    arrivalId: row.id,
    productId: row.product_id ?? null,
    productName: row.product_name ?? '',
    kind: 'in',
    quantity: Number(row.quantity) || 0,
    price: Number(row.by_price) || 0,
    supplier: row.supplier ?? '',
    // Приход уже уехал на сервер? Тогда количество править нельзя (см. queries/stockHistory.js).
    synced: Boolean(row.server_id),
    createdAt: Number(row.created_at) || 0,
    title: row.supplier ? `приход · ${row.supplier}` : 'приход на склад',
  }))

  const outgoing = expenses.map(row => ({
    id: `out-${row.id}`,
    arrivalId: null,
    productId: row.product_id ?? null,
    productName: row.product_name ?? '',
    kind: 'out',
    quantity: Number(row.quantity) || 0,
    price: Number(row.sale_price) || 0,
    supplier: '',
    synced: true,
    createdAt: Number(row.created_at) || 0,
    title: orderLabel(row),
  }))

  return [...incoming, ...outgoing].sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Движения товара: приходы и расходы одной лентой (новые сверху).
 * @param {string} productId локальный UUID товара
 */
export async function getByProductId(productId) {
  const arrivals = await dbAdapter.query(queries.arrivals, [productId])
  const expenses = await dbAdapter.query(queries.expenses, [productId])

  return toMovements({ arrivals, expenses })
}

/**
 * Движения всех товаров профиля — вкладка «движение товаров» на складе.
 * Пустой профиль (ни одной категории) — пустая история, без ошибки.
 *
 * ⚠️ Фильтр идёт по **двум** формам ключа профиля: в `product_categories.specialization_id`
 * лежит либо локальный UUID (категория создана на устройстве), либо серверный id (категория
 * приехала синком). Строгое равенство по локальному UUID делало вкладку пустой **только на
 * Android** (там категории синхронизированы), пока в браузере лента показывалась — дефект
 * 15.09.2026. Пару ключей отдаёт общий `specializationsRepo.resolveScopeKeys()`.
 *
 * @param {string} specializationId локальный id рабочего профиля
 * @param {number} [limit] сколько движений вернуть (по умолчанию `HISTORY_LIMIT`)
 */
export async function getAll(specializationId, limit = HISTORY_LIMIT) {
  if (!specializationId) return []

  const { localId, serverId } = await resolveScopeKeys(specializationId)

  const arrivals = await dbAdapter.query(queries.allArrivals, [localId, serverId, limit])
  const expenses = await dbAdapter.query(queries.allExpenses, [localId, serverId, limit])

  return toMovements({ arrivals, expenses }).slice(0, limit)
}

/**
 * Сколько движений лежит в локальной БД без фильтра профиля.
 *
 * Только для диагностики пустого состояния вкладки: «лента пуста, а в базе N приходов и
 * M расходов» сразу отделяет «движений нет» от «не подошёл фильтр» (дефект Android-only
 * 15.09.2026 выглядел именно вторым случаем).
 *
 * @returns {Promise<{arrivals: number, expenses: number}>}
 */
export async function countAll() {
  const [totals] = await dbAdapter.query(queries.dbTotals)

  return {
    arrivals: Number(totals?.arrivals) || 0,
    expenses: Number(totals?.expenses) || 0,
  }
}

