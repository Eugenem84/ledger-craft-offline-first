import { defineStore } from 'pinia'
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js'

export const useProductCategoriesStore = defineStore('product-categories', {
  state: () => ({
    items: [],
    loading: false,
    error: null
  }),

  actions: {
    async load(specializationId) {
      if (!specializationId) {
        this.items = []
        return
      }
      this.loading = true
      this.error = null
      try {
        this.items = await productCategoriesRepo.getBySpecializationId(specializationId)
      } catch (err) {
        this.error = err
      } finally {
        this.loading = false
      }
    },

    async add(data) {
      this.error = null
      const newItem = { ...data, id: data.id || crypto.randomUUID() }
      this.items.push(newItem)

      try {
        await productCategoriesRepo.save(newItem)
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
        await productCategoriesRepo.update({ id, ...changes })
      } catch (err) {
        this.error = err
        this.items[index] = oldItem
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(c => c.id !== id)
      try {
        await productCategoriesRepo.remove(id)
      } catch (err) {
        this.error = err
        this.items = oldList
        throw err
      }
    }
  }
})
