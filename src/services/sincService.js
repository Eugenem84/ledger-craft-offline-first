// services/syncService.js

import api from 'src/services/api';
import metaRepo from 'src/repositories/metaRepo';
import operationsRepo from 'src/repositories/operationsRepo';

import * as clientsRepo from 'src/repositories/clientsRepo';
// импортируй остальные репозитории по мере добавления

class SyncService {
  constructor() {
    this.syncing = false;

    // тут указываешь репозитории, а не имена таблиц
    this.repos = {
      clients: clientsRepo,
      // orders: ordersRepo,
      // invoices: invoicesRepo,
      // ...
    };
  }

  async sync() {
    if (this.syncing) return;
    this.syncing = true;

    try {
      await this._syncLocalToServer();
      await this._syncServerToLocal();
    } catch (e) {
      console.error('[SyncService] Ошибка синхронизации:', e);
    } finally {
      this.syncing = false;
    }
  }

  // 1. Отправляем локальные операции
  async _syncLocalToServer() {
    const pending = await operationsRepo.dequeue();

    for (const op of pending) {
      try {
        const serverRes = await api.send(op);
        await operationsRepo.markSynced(op, serverRes);
      } catch (e) {
        console.error('[SyncService] Ошибка отправки операции:', op, e);
        // не удаляем из очереди — повторим в следующем цикле
        throw e;
      }
    }
  }

  // 2. Забираем данные с сервера и передаем в репозитории
  async _syncServerToLocal() {
    const lastSyncedAt = await metaRepo.getLastSyncedAt();

    for (const table of Object.keys(this.repos)) {
      const repo = this.repos[table];

      const updates = await api.fetchUpdates({
        table,
        since: lastSyncedAt
      });

      for (const record of updates) {
        await repo.applyServerRecord(record);
      }
    }

    await metaRepo.setLastSyncedAt(Date.now());
  }
}

export default new SyncService();
