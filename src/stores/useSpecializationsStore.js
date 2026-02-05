// src/stores/useSpecializationsStore.js
import { defineStore } from 'pinia'
import * as specializationsRepo from 'src/repositories/specializationsRepo.js'

export const useSpecializationsStore = defineStore('specializations', {
  state: () => ({
    items: [],              // список специализаций
    selectedId: null,       // текущая выбранная
    loading: false,
    syncing: false,
    error: null
  }),

  getters: {
    getSelectedSpecialization(state) {
      return state.items.find(s => s.id === state.selectedId) || null
    },
    isLoaded: (state) => state.items.length > 0
  },

  actions: {
    async load() {
      this.loading = true
      try {
        this.items = await specializationsRepo.getAll()
        if (this.selectedId === null && this.items.length > 0) {
          this.selectedId = this.items[0].id
        }
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
      // оптимистично вносим в UI
      const newItem = { ...data, id: data.id || crypto.randomUUID() }
      this.items.push(newItem)

      try {
        await specializationsRepo.save(newItem)
      } catch (err) {
        this.error = err
        // откат если нужно
        this.items = this.items.filter(s => s.id !== newItem.id)
      }
    },

    async update(id, changes) {
      const index = this.items.findIndex(s => s.id === id)
      if (index === -1) return

      const oldItem = { ...this.items[index] }
      this.items[index] = { ...oldItem, ...changes }

      try {
        await specializationsRepo.update(id, changes)
      } catch (err) {
        this.error = err
        this.items[index] = oldItem
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(s => s.id !== id)
      try {
        await specializationsRepo.remove(id)
      } catch (err) {
        this.error = err
        this.items = oldList
      }
    }
  }
})
