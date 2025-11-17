import { defineStore } from 'pinia'
import * as clientsRepo from 'src/repositories/clientsRepo.js'

export const useClientsStore = defineStore('clients', {
  state: () => ({
    clients: [],
    loading: false,
    syncing: false,
    error: null
  }),
  actions: {
    async loadClients() {
      this.loading = true
      try {
        const result = await clientsRepo.getAll()
        console.log('[Store] Результат из репо:', result)
        this.clients = result
        console.log('[Store] this.clients после присвоения:', this.clients)
      } catch (err) {
        console.error('[Store] Ошибка при загрузке клиентов:', err)
      } finally {
        this.loading = false
      }
    },
    async addClient(client) {
      this.clients.push(client)          // оптимистично обновляем UI
      await clientsRepo.save(client)    // сохраняем через репозиторий
    },

  }
})
