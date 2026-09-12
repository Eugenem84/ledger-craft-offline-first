// src/stores/useAnalyticsStore.js
//
// Состояние страницы аналитики (задача 9.1).
//
// Стор только читает локальную БД (через `analyticsRepo`) и раскладывает данные в
// готовые для UI блоки. Вся арифметика — в чистой `src/utils/analytics.js`, поэтому
// правила («учтённый заказ», средний чек, корзины) лежат в одном месте и покрыты
// юнит-тестами. Запись данных в БД тут не происходит вовсе — очередь синка не трогается.
import { defineStore } from 'pinia'

import * as analyticsRepo from 'src/repositories/analyticsRepo.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import {
  ANALYTICS_PERIODS,
  DEFAULT_PERIOD,
  buildBuckets,
  getPeriodRange,
  revenueTotals,
  statusBreakdown,
  summarize,
} from 'src/utils/analytics.js'

export const useAnalyticsStore = defineStore('analytics', {
  state: () => ({
    /** Масштаб графика: `day` / `week` / `month` / `year`. */
    period: DEFAULT_PERIOD,
    /** Заказы мастерской с выручкой по позициям. */
    orders: [],
    topServices: [],
    topProducts: [],
    topMaterials: [],
    loading: false,
    error: null,
    loadedAt: null,
    specializationId: null,
  }),

  getters: {
    periodOptions: () => ANALYTICS_PERIODS,
    hasSpecialization: state => Boolean(state.specializationId),
    hasData: state => state.orders.length > 0,
    hasTops: state =>
      state.topServices.length + state.topProducts.length + state.topMaterials.length > 0,
    /** Выручка за сегодня / неделю / месяц / год (аналог серверного DWMY). */
    totals: state => revenueTotals(state.orders),
    /** Итоги выбранного периода-масштаба. */
    summary: state => summarize(state.orders, state.period),
    /** Корзины графика (пустые периоды — нулями). */
    buckets: state => buildBuckets(state.orders, state.period),
    /** Распределение по текущим статусам (без периода). */
    statuses: state => statusBreakdown(state.orders),
  },

  actions: {
    resetData() {
      this.orders = []
      this.topServices = []
      this.topProducts = []
      this.topMaterials = []
    },

    /**
     * Загружает заказы и топы активной специализации. Если специализации нет
     * (первый вход, ещё ничего не заведено) — просто пустые данные, без ошибки.
     */
    async load() {
      this.loading = true
      this.error = null

      try {
        const specializationsStore = useSpecializationsStore()

        if (!specializationsStore.isLoaded) {
          await specializationsStore.load()
        }

        this.specializationId = specializationsStore.getSelectedSpecialization?.id ?? null

        if (!this.specializationId) {
          this.resetData()
          return
        }

        this.orders = await analyticsRepo.getOrders(this.specializationId)
        await this.loadTops()
        this.loadedAt = Date.now()
      } catch (error) {
        this.error = error
      } finally {
        this.loading = false
      }
    },

    /** Полная перезагрузка (кнопка «обновить»). */
    async reload() {
      await this.load()
    },

    /**
     * Смена масштаба. Заказы перезапрашивать не нужно — они не зависят от периода,
     * а вот топы считаются по границам периода, поэтому их берём заново.
     */
    async setPeriod(period) {
      this.period = period
      await this.loadTops()
    },

    /** Топы работ/товаров/материалов за границы выбранного периода. */
    async loadTops() {
      if (!this.specializationId) {
        this.topServices = []
        this.topProducts = []
        this.topMaterials = []
        return
      }

      const { from, to } = getPeriodRange(this.period)

      this.topServices = await analyticsRepo.getTopServices(this.specializationId, from, to)
      this.topProducts = await analyticsRepo.getTopProducts(this.specializationId, from, to)
      this.topMaterials = await analyticsRepo.getTopMaterials(this.specializationId, from, to)
    },
  },
})
