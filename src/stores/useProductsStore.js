import { defineStore } from 'pinia'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as incomingProductsRepo from 'src/repositories/incomingProductsRepo.js'
import * as buyProductPricesRepo from 'src/repositories/buyProductPricesRepo.js'

export const useProductsStore = defineStore('products', {
  state: () => ({
    items: [],
    loading: false,
    error: null
  }),

  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.items = await productsRepo.getAll()
      } catch (err) {
        this.error = err
      } finally {
        this.loading = false
      }
    },

    async loadByCategoryId(categoryId) {
      this.loading = true;
      this.error = null;
      try {
        this.items = await productsRepo.getByCategoryId(categoryId);
      } catch (err) {
        this.error = err;
      } finally {
        this.loading = false;
      }
    },

    clear() {
      this.items = [];
    },

    async add(data) {
      this.error = null
      const newItem = { ...data, id: data.id || crypto.randomUUID() }
      this.items.push(newItem)

      try {
        await productsRepo.save(newItem)
      } catch (err) {
        this.error = err
        this.items = this.items.filter(c => c.id !== newItem.id)
      }
    },

    async update(id, changes) {
      this.error = null
      const index = this.items.findIndex(c => c.id === id)
      if (index === -1) return

      const oldItem = { ...this.items[index] }
      this.items[index] = { ...oldItem, ...changes }

      try {
        await productsRepo.update({ id, ...changes })
      } catch (err) {
        this.error = err
        this.items[index] = oldItem
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(c => c.id !== id)
      try {
        await productsRepo.remove(id)
      } catch (err) {
        this.error = err
        this.items = oldList
        throw err
      }
    },

    /**
     * Приход товара (задача 9.2).
     *
     * Всё офлайн: приход, закупочная цена и остаток пишутся в локальную БД, а на
     * сервер уезжает только очередь операций (повтор не удваивает остаток —
     * идемпотентность по `uuid_id` на сервере).
     *
     * @param {{ product: object, byPrice: number|string, arrivalQuantity: number|string,
     *   baseSalePrice?: number|string|null }} input
     * @returns {Promise<object>} результат прихода (`stockQuantity` — остаток после прихода)
     */
    async receiveArrival({ product, byPrice, arrivalQuantity, baseSalePrice }) {
      this.error = null

      try {
        const result = await incomingProductsRepo.receiveArrival({
          product,
          byPrice,
          arrivalQuantity,
          baseSalePrice,
        })

        // Цена продажи могла измениться приходом — отражаем это в списке склада.
        const index = this.items.findIndex(item => item.id === product.id)
        if (index !== -1 && result.baseSalePrice !== null) {
          this.items[index] = { ...this.items[index], base_sale_price: result.baseSalePrice }
        }

        return result
      } catch (err) {
        this.error = err
        throw err
      }
    },

    /**
     * Правка прихода (правка владельца 15.09.2026: «историю приходов тоже должна быть
     * возможность редактировать»).
     *
     * Остаток склада корректируется на дельту, закупка уезжает в `buy_product_prices`,
     * а операция — в очередь синка. Ограничение одно: количество прихода, который уже
     * уехал на сервер, менять нельзя (сервер остаток по нему не пересчитывает) — репозиторий
     * бросит понятную ошибку. Подробности — в `incomingProductsRepo.updateArrival`.
     *
     * @param {string} arrivalId локальный id прихода
     * @param {{quantity?: unknown, byPrice?: unknown, supplier?: unknown}} patch
     */
    async updateArrival(arrivalId, patch) {
      this.error = null

      try {
        const result = await incomingProductsRepo.updateArrival(arrivalId, patch)

        // Остаток мог измениться — отражаем это в списке склада сразу (офлайн-первый подход).
        if (result.stockQuantity !== null) {
          const index = this.items.findIndex(item => item.id === result.productId)
          if (index !== -1) {
            this.items[index] = { ...this.items[index], quantity: result.stockQuantity }
          }
        }

        return result
      } catch (err) {
        this.error = err
        throw err
      }
    },

    /**
     * Цена закупки товара, заданная вручную в карточке товара (задачи 9.5/9.6).
     *
     * Семантика та же, что у прихода: одна актуальная закупка на товар. Из неё
     * «Аналитика» считает себестоимость и маржу, поэтому строки заказа берут
     * `buy_price` товара в момент продажи.
     *
     * @param {string} id локальный UUID товара
     * @param {number|string} buyPrice целые рубли
     */
    async saveBuyPrice(id, buyPrice) {
      this.error = null
      const price = Math.round(Number(buyPrice) || 0)

      try {
        await buyProductPricesRepo.saveBuyPrice(id, price)

        const index = this.items.findIndex(item => item.id === id)
        if (index !== -1) {
          this.items[index] = { ...this.items[index], buy_price: price }
        }
      } catch (err) {
        this.error = err
        throw err
      }
    }
  }
})
