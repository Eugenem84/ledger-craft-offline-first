import { defineStore } from 'pinia'
import * as ordersRepo from 'src/repositories/ordersRepo.js'
import { useSpecializationsStore } from "stores/useSpecializationsStore.js";

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    items: [],
    selectedId: null,
    loading: false,
    syncing: false,
    error: null
  }),

  getters: {
    getSelectedOrder(state) {
      return state.items.find(o => o.id === state.selectedId) || null
    },
    isLoaded: (state) => state.items.length > 0
  },

  actions: {
    async load() {
      this.loading = true
      this.error = null
      try {
        const specializationsStore = useSpecializationsStore();
        const specializationId = specializationsStore.selectedSpecialization?.id;

        if (specializationId) {
          this.items = await ordersRepo.getBySpecializationId(specializationId);
        } else {
          this.items = await ordersRepo.getAll();
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
      this.error = null
      const newItem = { ...data, id: data.id || crypto.randomUUID() }
      this.items.push(newItem)

      try {
        await ordersRepo.save(newItem)
      } catch (err) {
        this.error = err
        this.items = this.items.filter(o => o.id !== newItem.id)
      }
    },

    async update(id, changes) {
      this.error = null
      const index = this.items.findIndex(o => o.id === id)
      if (index === -1) return

      const oldItem = { ...this.items[index] }
      this.items[index] = { ...oldItem, ...changes }

      try {
        await ordersRepo.update({ id, ...changes })
      } catch (err) {
        this.error = err
        this.items[index] = oldItem
      }
    },

    async remove(id) {
      const oldList = [...this.items]
      this.items = this.items.filter(o => o.id !== id)
      try {
        await ordersRepo.remove(id)
      } catch (err) {
        this.error = err
        this.items = oldList
        throw err
      }
    }
  }
})
