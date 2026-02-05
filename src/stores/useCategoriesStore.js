import { defineStore } from 'pinia'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'

export const useCategoriesStore = defineStore('categories', {
  state: () => ({
    items: [],
    selectedId: null,
    loading: false,
    syncing: false,
    error: null
  }),

  getters: {
    getSelectedCategory(state) {
      return state.items.find(c => c.id === state.selectedId) || null
    },
    isLoaded: (state) => state.items.length > 0
  },

  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.items = await categoriesRepo.getAll()
      } catch (err) {
        this.error = err
      } finally {
        this.loading = false
      }
    },

    async select(id) {
      this.selectedId = id
    },

    async add(data) {
      this.error = null
      const newItem = { ...data, id: data.id || crypto.randomUUID() }
      this.items.push(newItem)

      try {
        await categoriesRepo.save(newItem)
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
        await categoriesRepo.update({ id, ...changes })
      } catch (err) {
        this.error = err
        this.items[index] = oldItem
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(c => c.id !== id)
      try {
        await categoriesRepo.remove(id)
      } catch (err) {
        this.error = err
        this.items = oldList
        throw err
      }
    }
  }
})
