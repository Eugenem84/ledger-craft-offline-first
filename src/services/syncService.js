// services/syncService.js

import dbAdapter from 'src/database/adapters/sqljs-web-adapter';
import api from 'src/services/api';
import * as metaRepo from 'src/repositories/metaRepo';
import operationsRepo from 'src/repositories/operationsRepo';

import * as clientsRepo from 'src/repositories/clientsRepo';
import * as specializationsRepo from 'src/repositories/specializationsRepo';
// импортируй остальные репозитории по мере добавления

class SyncService {
  constructor() {
    this.syncing = false;

    // тут указываешь репозитории, а не имена таблиц
    this.repos = {
      clients: clientsRepo,
      specializations: specializationsRepo,
      // orders: ordersRepo,
      // invoices: invoicesRepo,
      // ...
    };
  }

  async sync() {
    console.log('[Sync] start');

    if (this.syncing) {
      console.log('[Sync] already syncing');
      return;
    }

    this.syncing = true;

    try {
      await this._syncLocalToServer();
      await this._syncServerToLocal();
    } catch (e) {
      console.error('[SyncService] Ошибка синхронизации:', e);
    } finally {
      this.syncing = false;
      console.log('[Sync] end');
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

      console.log(`[Sync] fetching updates for table "${table}" since ${lastSyncedAt}`);

      const response = await api.fetchUpdates({
        table,
        since: lastSyncedAt
      });

      console.log(`[Sync] raw response for table "${table}":`, response);

      const records = Array.isArray(response)
        ? response
        : Array.isArray(response?.records)
          ? response.records
          : [];

      console.log(`[Sync] received ${records.length} updates for table "${table}"`);
      console.log(`[Sync] updates for table "${table}":`, records);

      for (const record of records) {
        console.log(`[Sync] applying record to "${table}":`, record);
        await repo.applyServerRecord(record);
      }
    }

    await metaRepo.setLastSyncedAt(Date.now());
  }

  /**
   * Полный сброс локальных данных для отладки.
   * Очищает все таблицы, управляемые синхронизацией, и сбрасывает время последней синхронизации.
   */
  async fullReset() {
    console.log('[Sync] Full reset started');
    for (const table of Object.keys(this.repos)) {
      const repo = this.repos[table];
      if (typeof repo.clearAll === 'function') {
        console.log(`[Sync] Clearing table "${table}"`);
        await repo.clearAll();
      }
    }
    await metaRepo.resetLastSyncedAt();
    console.log('[Sync] Full reset finished');
  }

  /**
   * Полностью удаляет локальную базу данных.
   * Требует перезагрузки страницы для повторной инициализации.
   */
  async deleteLocalDB() {
    console.log('[SyncService] Deleting local database.');
    await dbAdapter.deleteDatabase();
  }
}

export default new SyncService();
