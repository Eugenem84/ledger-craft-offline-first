// test/analytics.test.js
//
// Задача 9.1: чистая логика аналитики — периоды, «учтённые» заказы, выручка,
// средний чек, распределение по статусам. БД и Pinia здесь не нужны: правила живут
// в `src/utils/analytics.js`, поэтому проверяются обычными проверками.
//
// Контрольная цифра набора (1700 / 2 заказа / чек 850) та же, что в серверном тесте
// `LedgerCraftDocker03/tests/Feature/StatisticRepositoryTest.php` — так проверяется
// критерий «цифры на странице совпадают с серверными отчётами».
import { describe, it, expect } from 'vitest'

import {
  ANALYTICS_PERIODS,
  billedOrders,
  bucketKey,
  buildBuckets,
  getPeriodBuckets,
  getPeriodRange,
  isBilledOrder,
  isoWeekKey,
  marginPercent,
  orderCost,
  orderMargin,
  orderRevenue,
  revenueTotals,
  startOfIsoWeek,
  statusBreakdown,
  summarize,
} from 'src/utils/analytics.js'

/** 12 сентября 2026 (суббота), локальное время — «сейчас» для тестов. */
const NOW = new Date(2026, 8, 12, 12, 0, 0)

const seconds = date => Math.floor(new Date(date).getTime() / 1000)

/**
 * Заказ в том виде, в каком его отдаёт `analyticsRepo`.
 *
 * `productsCost`/`materialsCost` — себестоимость позиций (задачи 9.5/9.6): у работ её
 * нет (труд мастера), поэтому в `orderCost` входят только эти два поля.
 */
const order = ({
  id = 'order',
  status = 'done',
  paid = true,
  updatedAt = NOW,
  services = 0,
  products = 0,
  materials = 0,
  productsCost = 0,
  materialsCost = 0,
} = {}) => ({
  id,
  status,
  paid,
  updated_at: seconds(updatedAt),
  services_total: services,
  products_total: products,
  materials_total: materials,
  products_cost: productsCost,
  materials_cost: materialsCost,
})

describe('9.1 аналитика: методика', () => {
  it('выручка заказа — это позиции (работы + товары + материалы), а не total_amount', () => {
    expect(orderRevenue({ services_total: 600, products_total: 1000, materials_total: 100 })).toBe(
      1700
    )
    expect(orderRevenue({ services_total: '300' })).toBe(300)
    expect(orderRevenue({ total_amount: 9999 })).toBe(0)
    expect(orderRevenue({})).toBe(0)
  })

  it('учтённый заказ — закрытый и оплаченный (paid из локальной БД — 1/0)', () => {
    expect(isBilledOrder(order())).toBe(true)
    expect(isBilledOrder(order({ paid: 1 }))).toBe(true)
    expect(isBilledOrder(order({ paid: 0 }))).toBe(false)
    expect(isBilledOrder(order({ paid: false }))).toBe(false)
    expect(isBilledOrder(order({ status: 'waiting' }))).toBe(false)
    expect(isBilledOrder(order({ status: 'process' }))).toBe(false)

    expect(
      billedOrders([order(), order({ paid: 0 }), order({ status: 'process' }), order()])
    ).toHaveLength(2)
  })

  it('выручка «сегодня / неделя / месяц / год» — как серверный getProfitDWMY', () => {
    const monday = startOfIsoWeek(NOW)
    const tuesday = new Date(monday.getTime() + 24 * 60 * 60 * 1000)

    const totals = revenueTotals(
      [
        order({ updatedAt: NOW, services: 100 }), // сегодня
        order({ updatedAt: tuesday, services: 200 }), // эта же неделя
        order({ updatedAt: new Date(2026, 8, 15, 10), services: 400 }), // этот месяц, другая неделя
        order({ updatedAt: new Date(2026, 7, 15, 10), services: 800 }), // этот год, прошлый месяц
        order({ updatedAt: new Date(2025, 5, 15, 10), services: 1600 }), // прошлый год
        order({ updatedAt: NOW, services: 3200, paid: false }), // не учтён
      ],
      NOW
    )

    expect(totals.day).toBe(100)
    expect(totals.week).toBe(300)
    expect(totals.month).toBe(700)
    expect(totals.year).toBe(1500)
  })

  it('корзины периодов: те же диапазоны, что у серверного getDateRange', () => {
    expect(getPeriodBuckets('day', NOW)).toHaveLength(31) // 30 дней + сегодня
    expect(getPeriodBuckets('week', NOW)).toHaveLength(16) // 15 недель + текущая
    expect(getPeriodBuckets('month', NOW)).toHaveLength(12)
    expect(getPeriodBuckets('year', NOW)).toHaveLength(5)

    const days = getPeriodBuckets('day', NOW)
    expect(days[0].key).toBe('2026-08-13')
    expect(days[30].key).toBe('2026-09-12')
    expect(days[30].label).toBe('12.09')

    const months = getPeriodBuckets('month', NOW)
    expect(months[0].key).toBe('2025-10')
    expect(months[11].key).toBe('2026-09')

    expect(getPeriodBuckets('year', NOW).map(bucket => bucket.key)).toEqual([
      '2022',
      '2023',
      '2024',
      '2025',
      '2026',
    ])

    const range = getPeriodRange('month', NOW)
    expect(range.from).toBe(seconds(new Date(2025, 9, 1)))
    expect(range.to).toBe(seconds(new Date(2026, 8, 30, 23, 59, 59)))
  })

  it('ключи ISO-недель совпадают с серверным форматом IYYY-"W"IW', () => {
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01') // 1 января — четверг
    expect(isoWeekKey(new Date(2025, 11, 29))).toBe('2026-W01') // понедельник той же недели
    expect(isoWeekKey(new Date(2026, 8, 12))).toBe('2026-W37')

    expect(bucketKey(new Date(2026, 8, 12), 'day')).toBe('2026-09-12')
    expect(bucketKey(new Date(2026, 8, 12), 'month')).toBe('2026-09')
    expect(bucketKey(new Date(2026, 8, 12), 'year')).toBe('2026')
  })

  it('buildBuckets: сумма по корзинам и нули в пустых периодах', () => {
    const buckets = buildBuckets(
      [
        order({ updatedAt: NOW, services: 500 }),
        order({ updatedAt: NOW, services: 300, products: 200 }),
        order({ updatedAt: NOW, services: 999, paid: false }),
        order({ updatedAt: new Date(2026, 7, 15, 10), services: 100 }),
      ],
      'month',
      NOW
    )

    expect(buckets).toHaveLength(12)
    expect(buckets.find(bucket => bucket.key === '2026-09')).toMatchObject({
      total: 1000,
      count: 2,
    })
    expect(buckets.find(bucket => bucket.key === '2026-08')).toMatchObject({ total: 100, count: 1 })
    expect(buckets.find(bucket => bucket.key === '2026-07')).toMatchObject({ total: 0, count: 0 })
  })

  it('summarize: выручка, себестоимость, маржа, число заказов и средний чек', () => {
    const summary = summarize(
      [
        // закупка 740: 1×700 (товар) + 2×20 (материал) — как в BE-тесте 9.5
        order({ services: 600, products: 1000, materials: 100, productsCost: 700, materialsCost: 40 }),
        order({}),
        order({ services: 5000, paid: false }),
        order({ updatedAt: new Date(2020, 0, 1), services: 7000 }),
      ],
      'month',
      NOW
    )

    expect(summary).toEqual({
      revenue: 1700,
      cost: 740,
      margin: 960,
      marginPercent: 130, // 960 / 740 = 129.7… → 130 %
      ordersCount: 2,
      averageCheck: 850,
    })
  })

  it('себестоимость и маржа: у работ закупки нет, наценка без закупки — null (9.5/9.6)', () => {
    const withPurchase = order({ services: 300, products: 1000, productsCost: 700 })

    expect(orderCost(withPurchase)).toBe(700)
    expect(orderMargin(withPurchase)).toBe(600) // 1300 − 700
    expect(orderMargin(withPurchase)).toBe(orderRevenue(withPurchase) - orderCost(withPurchase))
    expect(marginPercent(orderRevenue(withPurchase), orderCost(withPurchase))).toBe(
      Math.round((600 / 700) * 100)
    )

    // Мастер не указал закупку: маржа равна выручке, а наценку посчитать не из чего.
    const withoutPurchase = order({ services: 300, materials: 200 })

    expect(orderCost(withoutPurchase)).toBe(0)
    expect(orderMargin(withoutPurchase)).toBe(500)
    expect(marginPercent(orderRevenue(withoutPurchase), orderCost(withoutPurchase))).toBeNull()

    // Заказ без позиций — тоже «нет себестоимости», а не 0 %.
    expect(summarize([order({})], 'month', NOW).marginPercent).toBeNull()
  })

  it('statusBreakdown: известные статусы по порядку формы, неизвестные — «без статуса»', () => {
    const rows = statusBreakdown([
      order({ status: 'done' }),
      order({ status: 'done' }),
      order({ status: 'waiting' }),
      order({ status: null }),
      order({ status: 'zzz' }),
    ])

    expect(rows).toEqual([
      { value: 'waiting', label: 'ожидает', count: 1 },
      { value: 'done', label: 'готово', count: 2 },
      { value: 'unknown', label: 'без статуса', count: 2 },
    ])
  })

  it('масштабы графика — те же ключи периодов, что у сервера', () => {
    expect(ANALYTICS_PERIODS.map(period => period.value)).toEqual(['day', 'week', 'month', 'year'])
  })
})
