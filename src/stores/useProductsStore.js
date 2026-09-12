import { defineStore } from 'pinia'
import * as productsRepo from 'src/repositories/productsRepo.js'
import * as incomingProductsRepo from 'src/repositories/incomingProductsRepo.js'

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
    }
  }
})
