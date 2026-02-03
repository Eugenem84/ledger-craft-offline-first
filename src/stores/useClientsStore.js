import { defineStore } from 'pinia'
import * as clientsRepo from 'src/repositories/clientsRepo.js'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    items: [], // Переименовываем для консистентности
    selectedId: null,
    loading: false,
    syncing: false,
    error: null
  }),

  getters: {
    getSelectedClient(state) {
      return state.items.find(c => c.id === state.selectedId) || null
    },
    isLoaded: (state) => state.items.length > 0
  },

  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.items = await clientsRepo.getAll()
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
      // Оптимистично добавляем в UI, генерируя временный ID
      const newItem = { ...data, id: data.id || crypto.randomUUID() }
      this.items.push(newItem)

      try {
        await clientsRepo.save(newItem)
      } catch (err) {
        this.error = err
        // Откат в случае ошибки
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
        // В репозиторий нужно передавать весь объект или id + changes,
        // в зависимости от реализации repo.update
        await clientsRepo.update({ id, ...changes })
      } catch (err) {
        this.error = err
        this.items[index] = oldItem // Откат
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(c => c.id !== id)
      try {
        await clientsRepo.remove(id)
      } catch (err) {
        this.error = err
        this.items = oldList // Откат
      }
    }
  }
})
