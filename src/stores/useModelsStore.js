import { defineStore } from 'pinia'
import * as modelsRepo from 'src/repositories/modelsRepo.js'

export const useModelsStore = defineStore('models', {
  state: () => ({
    items: [],
    selectedId: null,
    loading: false,
    syncing: false,
    error: null
  }),

  getters: {
    getSelectedModel(state) {
      return state.items.find(m => m.id === state.selectedId) || null
    },
    isLoaded: (state) => state.items.length > 0
  },

  actions: {
    /**
     * Модели техники активного профиля (Фаза 10, строгий фильтр).
     *
     * @param {string} [specializationId] локальный UUID активной специализации;
     *   без него (профилей ещё нет) — прежний `getAll`
     */
    async load(specializationId) {
      this.loading = true
      this.error = null
      try {
        this.items = specializationId
          ? await modelsRepo.getBySpecializationId(specializationId)
          : await modelsRepo.getAll()
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
        await modelsRepo.save(newItem)
      } catch (err) {
        this.error = err
        this.items = this.items.filter(m => m.id !== newItem.id)
      }
    },

    async update(id, changes) {
      this.error = null
      const index = this.items.findIndex(m => m.id === id)
      if (index === -1) return

      const oldItem = { ...this.items[index] }
      this.items[index] = { ...oldItem, ...changes }

      try {
        await modelsRepo.update({ id, ...changes })
      } catch (err) {
        this.error = err
        this.items[index] = oldItem
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(m => m.id !== id)
      try {
        await modelsRepo.remove(id)
      } catch (err) {
        this.error = err
        this.items = oldList
        throw err
      }
    }
  }
})
