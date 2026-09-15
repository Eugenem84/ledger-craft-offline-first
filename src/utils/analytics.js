// src/utils/analytics.js
//
// Чистая логика аналитики (задача 9.1): периоды, «учтённые» заказы, выручка,
// средний чек, распределение по статусам. Здесь нет ни БД, ни Pinia, поэтому всё
// это проверяется обычным юнит-тестом (`test/analytics.test.js`), а стор и страница
// остаются «тонкими».
//
// **Единая методика выручки** — та же, что на сервере (`StatisticRepository::billedOrdersSubquery`):
//
//   • учтённый заказ — `status = 'done'`, `paid`, не удалённый; период — по `updated_at`
//     (дата закрытия/последнего изменения заказа — как в серверных отчётах);
//   • выручка заказа = позиции: работы (`order_service.quantity * sale_price`)
//     + товары (`order_product.quantity * sale_price`)
//     + ручные материалы (`materials.amount * price`);
//   • себестоимость (задачи 9.5/9.6) = закупка товаров со склада
//     (`order_product.buy_price`) + закупка ручных позиций (`materials.buy_price`);
//     у работ себестоимости нет — это труд мастера, поэтому их маржа равна выручке;
//   • маржа = выручка − себестоимость; наценка = маржа / себестоимость × 100;
//   • средний чек = выручка / число учтённых заказов (заказ без позиций входит нулевым);
//   • границы периодов — как у серверного `getDateRange`: день — 30 дней,
//     неделя — 15 недель, месяц — 12 месяцев, год — 5 лет.
//
// Контрольные цифры клиентского теста (`test/analytics-repo.test.js`) совпадают с
// серверным `tests/Feature/StatisticRepositoryTest.php` — это и есть критерий
// «цифры на странице аналитики сходятся с серверными отчётами».
import { toEpochSeconds } from 'src/utils/timestamps.js'

/** Масштабы графика. Подписи такие же, как у серверных диапазонов. */
export const ANALYTICS_PERIODS = [
  { value: 'day', label: '30 дней' },
  { value: 'week', label: '15 недель' },
  { value: 'month', label: '12 месяцев' },
  { value: 'year', label: '5 лет' },
]

export const DEFAULT_PERIOD = 'month'

/** Статусы заказа — те же значения, что в форме заказа (`OrderHeaderActions.vue`). */
export const ORDER_STATUSES = [
  { value: 'waiting', label: 'ожидает' },
  { value: 'process', label: 'в работе' },
  { value: 'done', label: 'готово' },
]

const UNKNOWN_STATUS = { value: 'unknown', label: 'без статуса' }

/**
 * Иконки статусов для UI. Чип статуса (`LcStatusChip.vue`) и сегменты переключателя
 * в карточке заказа (`OrderHeaderActions.vue`) берут их из одной карты, чтобы
 * «статус» и «тумблер статуса» читались одинаково (правка владельца 15.09.2026).
 *
 * Отдельной картой, а не полем в `ORDER_STATUSES`: словарь уходит в отчёты
 * (`statusBreakdown` → `{ value, label, count }`) и сверяется с сервером, лишний
 * ключ в нём сломал бы сверку.
 */
export const ORDER_STATUS_ICONS = {
  waiting: 'schedule',
  process: 'build',
  done: 'check_circle',
  unknown: 'help',
}

const DAY_MS = 24 * 60 * 60 * 1000

const num = value => Number(value ?? 0) || 0
const pad = (value, length = 2) => String(value).padStart(length, '0')

const startOfDay = date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const endOfDay = date => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

const startOfMonth = date => {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

const endOfMonth = date => endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))

/** Понедельник ISO-недели — как серверный `startOfWeek()`/`date_trunc('week')`. */
export function startOfIsoWeek(date) {
  const d = startOfDay(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Ключ ISO-недели (`IYYY-Www`) — тот же формат, что у серверного `to_char(..., 'IYYY-"W"IW')`. */
export function isoWeekKey(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7

  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target - yearStart) / DAY_MS + 1) / 7)

  return `${target.getUTCFullYear()}-W${pad(week)}`
}

/** Ключ корзины периода: `2026-09-12` / `2026-W37` / `2026-09` / `2026`. */
export function bucketKey(date, period) {
  const d = new Date(date)

  switch (period) {
    case 'day':
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    case 'week':
      return isoWeekKey(d)
    case 'month':
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
    default:
      return String(d.getFullYear())
  }
}

/**
 * Границы диапазона и «корзины» (для графика) выбранного масштаба.
 *
 * @param {string} period
 * @param {Date} [now]
 * @returns {Array<{key: string, label: string, from: Date, to: Date}>}
 */
export function getPeriodBuckets(period, now = new Date()) {
  const buckets = []

  if (period === 'day') {
    const start = startOfDay(new Date(now.getTime() - 30 * DAY_MS))

    for (let i = 0; i <= 30; i += 1) {
      const from = new Date(start)
      from.setDate(start.getDate() + i)

      buckets.push({
        key: bucketKey(from, 'day'),
        label: `${pad(from.getDate())}.${pad(from.getMonth() + 1)}`,
        from,
        to: endOfDay(from),
      })
    }

    return buckets
  }

  if (period === 'week') {
    const start = startOfIsoWeek(new Date(now.getTime() - 15 * 7 * DAY_MS))

    for (let i = 0; i <= 15; i += 1) {
      const from = new Date(start)
      from.setDate(start.getDate() + i * 7)

      buckets.push({
        key: isoWeekKey(from),
        label: `W${pad(Number(isoWeekKey(from).split('-W')[1]))}`,
        from,
        to: endOfDay(new Date(from.getTime() + 6 * DAY_MS)),
      })
    }

    return buckets
  }

  if (period === 'month') {
    const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1))

    for (let i = 0; i <= 11; i += 1) {
      const from = startOfMonth(new Date(start.getFullYear(), start.getMonth() + i, 1))

      buckets.push({
        key: bucketKey(from, 'month'),
        label: `${pad(from.getMonth() + 1)}.${from.getFullYear()}`,
        from,
        to: endOfMonth(from),
      })
    }

    return buckets
  }

  const startYear = now.getFullYear() - 4

  for (let i = 0; i <= 4; i += 1) {
    const year = startYear + i

    buckets.push({
      key: String(year),
      label: String(year),
      from: startOfDay(new Date(year, 0, 1)),
      to: endOfDay(new Date(year, 11, 31)),
    })
  }

  return buckets
}

/** Границы периода в UNIX-секундах — для запросов к БД (`updated_at BETWEEN ? AND ?`). */
export function getPeriodRange(period, now = new Date()) {
  const buckets = getPeriodBuckets(period, now)

  return {
    from: Math.floor(buckets[0].from.getTime() / 1000),
    to: Math.floor(buckets[buckets.length - 1].to.getTime() / 1000),
  }
}


/** Выручка заказа: работы + товары + ручные материалы (одна методика, задача 9.1). */
export function orderRevenue(order) {
  return num(order?.services_total) + num(order?.products_total) + num(order?.materials_total)
}

/**
 * Себестоимость заказа (задачи 9.5/9.6): закупка товаров со склада + закупка ручных
 * позиций. У работ себестоимости нет — это труд мастера, поэтому их маржа равна выручке
 * (так же считает серверный `StatisticRepository::billedOrdersSubquery`).
 */
export function orderCost(order) {
  return num(order?.products_cost) + num(order?.materials_cost)
}

/** Маржа заказа = выручка − себестоимость. Сходится с суммой позиций заказа. */
export function orderMargin(order) {
  return orderRevenue(order) - orderCost(order)
}

/** Наценка в % к себестоимости; `null` — себестоимости в заказе нет (делить не на что). */
export function marginPercent(revenue, cost) {
  const base = num(cost)
  return base > 0 ? Math.round((num(revenue) - base) / base * 100) : null
}

/** Учтённый заказ: закрыт и оплачен. */
export function isBilledOrder(order) {
  return order?.status === 'done' && Boolean(order?.paid)
}

/** Учтённые заказы (удалённые отсекает `analyticsRepo` самим запросом). */
export function billedOrders(orders = []) {
  return orders.filter(isBilledOrder)
}

/** Дата заказа (`updated_at` в секундах) или `null`, если её нет/она битая. */
function orderDate(order) {
  const seconds = toEpochSeconds(order?.updated_at, 0)
  return seconds > 0 ? new Date(seconds * 1000) : null
}

/**
 * Выручка за сегодня / текущую неделю / текущий месяц / текущий год — аналог
 * серверного `getProfitDWMY` (границы календарные, «сегодня» — локальная дата).
 *
 * @returns {{day: number, week: number, month: number, year: number}}
 */
export function revenueTotals(orders = [], now = new Date()) {
  const keys = {
    day: bucketKey(now, 'day'),
    week: isoWeekKey(now),
    month: bucketKey(now, 'month'),
    year: bucketKey(now, 'year'),
  }

  const totals = { day: 0, week: 0, month: 0, year: 0 }

  for (const order of billedOrders(orders)) {
    const date = orderDate(order)
    if (!date) continue

    const revenue = orderRevenue(order)

    if (bucketKey(date, 'day') === keys.day) totals.day += revenue
    if (isoWeekKey(date) === keys.week) totals.week += revenue
    if (bucketKey(date, 'month') === keys.month) totals.month += revenue
    if (bucketKey(date, 'year') === keys.year) totals.year += revenue
  }

  return totals
}

/** Выручка и число учтённых заказов по корзинам периода (пустые — нулями). */
export function buildBuckets(orders = [], period = DEFAULT_PERIOD, now = new Date()) {
  const buckets = getPeriodBuckets(period, now).map(bucket => ({
    key: bucket.key,
    label: bucket.label,
    total: 0,
    count: 0,
  }))

  const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]))

  for (const order of billedOrders(orders)) {
    const date = orderDate(order)
    if (!date) continue

    const bucket = byKey.get(bucketKey(date, period))
    if (!bucket) continue

    bucket.total += orderRevenue(order)
    bucket.count += 1
  }

  return buckets
}

/**
 * Итоги за выбранный период: выручка, себестоимость, маржа, число заказов и средний чек
 * (заказы без позиций входят в делитель — как на сервере).
 */
export function summarize(orders = [], period = DEFAULT_PERIOD, now = new Date()) {
  const { from, to } = getPeriodRange(period, now)

  const billed = billedOrders(orders).filter(order => {
    const seconds = toEpochSeconds(order.updated_at, 0)
    return seconds >= from && seconds <= to
  })

  const revenue = billed.reduce((sum, order) => sum + orderRevenue(order), 0)
  const cost = billed.reduce((sum, order) => sum + orderCost(order), 0)

  return {
    revenue,
    cost,
    margin: revenue - cost,
    marginPercent: marginPercent(revenue, cost),
    ordersCount: billed.length,
    averageCheck: billed.length ? Math.round(revenue / billed.length) : 0,
  }
}

/**
 * Распределение заказов по текущему статусу. Периода здесь нет намеренно: это
 * «что сейчас в работе», а не выручка за отрезок (так же считает сервер).
 * Неизвестные/пустые статусы идут последней строкой «без статуса».
 */
export function statusBreakdown(orders = []) {
  const counts = new Map()

  for (const order of orders) {
    const known = ORDER_STATUSES.some(status => status.value === order?.status)
    const key = known ? order.status : UNKNOWN_STATUS.value

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...ORDER_STATUSES, UNKNOWN_STATUS]
    .map(status => ({ ...status, count: counts.get(status.value) ?? 0 }))
    .filter(status => status.count > 0)
}

