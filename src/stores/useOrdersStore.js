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
          // Ждем загрузки специализаций, если они еще не загружены
        if (!specializationsStore.isLoaded) {
          await specializationsStore.load();
        }
        const specializationId = specializationsStore.getSelectedSpecialization?.id;

        if (specializationId) {
          this.items = await ordersRepo.getBySpecializationId(specializationId);
        } else {
          // Загружаем все, если специализация не выбрана (или их нет)
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
      const specializationsStore = useSpecializationsStore();
      const selectedSpecialization = specializationsStore.getSelectedSpecialization;

      const newItem = {
        ...data,
        id: data.id || crypto.randomUUID(),
        paid: data.paid ? 1 : 0,
        specialization_id: selectedSpecialization?.id || null,
        specialization_server_id: selectedSpecialization?.server_id || null,
      }
      this.items.push(newItem)

      try {
        // Теперь newItem содержит данные о специализации
        await ordersRepo.save(newItem)
        return newItem.id // Возвращаем только ID созданного элемента
      } catch (err) {
        this.error = err
        this.items = this.items.filter(o => o.id !== newItem.id)
        throw err // Пробрасываем ошибку для обработки в компоненте
      }
    },

    async update(id, changes) {
      this.error = null
      const index = this.items.findIndex(o => o.id === id)
      if (index === -1) return

      const oldItem = { ...this.items[index] }
      const updatedItem = { ...oldItem, ...changes }
      if (changes.paid !== undefined) {
        updatedItem.paid = changes.paid ? 1 : 0
      }
      this.items[index] = updatedItem

      try {
        await ordersRepo.update(updatedItem)
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
