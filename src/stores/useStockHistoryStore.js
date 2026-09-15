// src/stores/useStockHistoryStore.js
//
// История склада (правка владельца 15.09.2026: «в разделе склад нужна история приходов
// и расходов товаров», «две вкладки: товары и … история движения по складу»).
//
// Два режима чтения, оба — только чтение (`stockHistoryRepo`):
//   • `load(productId)` — движения одного товара (карточка товара);
//   • `loadAll(specializationId)` — движения всех товаров профиля (вкладка «движение
//     товаров» на складе).
//
// Ни записи, ни очереди синка здесь нет: историю формируют уже существующие операции
// склада и заказов, а правка прихода живёт в `useProductsStore.updateArrival`.
import { defineStore } from 'pinia'

import * as stockHistoryRepo from 'src/repositories/stockHistoryRepo.js'

export const useStockHistoryStore = defineStore('stockHistory', {
  state: () => ({
    /** Товар, для которого загружена история (`null` — история профиля). */
    productId: null,
    /** Профиль, для которого загружена история всех товаров (вкладка «движение товаров»). */
    specializationId: null,
    /** Движения: приход «+» и расход «−», новые сверху. */
    movements: [],
    loading: false,
    error: null,
  }),

  getters: {
    hasMovements: state => state.movements.length > 0,
    /**
     * Список обрезан лимитом (`stockHistoryRepo.HISTORY_LIMIT`)? Тогда вкладка честно
     * говорит «показаны последние N», а не делает вид, что история кончилась.
     */
    truncated: state => state.movements.length >= stockHistoryRepo.HISTORY_LIMIT,
    /** Сколько всего пришло и ушло — короткая сводка над лентой. */
    totalIn: state =>
      state.movements
        .filter(movement => movement.kind === 'in')
        .reduce((sum, movement) => sum + movement.quantity, 0),
    totalOut: state =>
      state.movements
        .filter(movement => movement.kind === 'out')
        .reduce((sum, movement) => sum + movement.quantity, 0),
  },

  actions: {
    reset() {
      this.productId = null
      this.specializationId = null
      this.movements = []
      this.error = null
    },

    /**
     * Читает историю одного товара (карточка товара).
     * Без товара просто очищает состояние (без ошибки).
     */
    async load(productId) {
      this.reset()

      if (!productId) return

      this.productId = productId
      this.movements = await this._read(() => stockHistoryRepo.getByProductId(productId))
    },

    /**
     * Читает историю **всех** товаров профиля (вкладка «движение товаров» на складе).
     * Без профиля (ещё ничего не заведено) — пустая история, без ошибки.
     */
    async loadAll(specializationId) {
      this.reset()

      if (!specializationId) return

      this.specializationId = specializationId
      this.movements = await this._read(() => stockHistoryRepo.getAll(specializationId))
    },

    /** Общее для обоих режимов: флаг загрузки, ошибка и «пусто» вместо падения страницы. */
    async _read(factory) {
      this.loading = true

      try {
        return await factory()
      } catch (error) {
        this.error = error
        return []
      } finally {
        this.loading = false
      }
    },
  },
})
