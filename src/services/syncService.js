// services/syncService.js

import dbAdapter from 'src/database/adapters/sqljs-web-adapter';
import api from 'src/services/api';
import * as metaRepo from 'src/repositories/metaRepo';
import operationsRepo from 'src/repositories/operationsRepo';

import * as clientsRepo from 'src/repositories/clientsRepo';
import * as specializationsRepo from 'src/repositories/specializationsRepo';
import * as categoriesRepo from 'src/repositories/categoriesRepo';
import * as servicesRepo from 'src/repositories/servicesRepo';
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo'; // Импортируем репо
import * as productsRepo from 'src/repositories/productsRepo'; // Импортируем репо
import * as ordersRepo from 'src/repositories/ordersRepo'; // Импортируем репо

import { logAllServicesForDebugging } from 'src/repositories/servicesRepo';

class SyncService {
  constructor() {
    this.syncing = false;

    this.repos = {
      clients: clientsRepo,
      specializations: specializationsRepo,
      categories: categoriesRepo,
      services: servicesRepo,
      product_categories: productCategoriesRepo, // Добавляем репо в список
      products: productsRepo, // Добавляем репо в список
      orders: ordersRepo, // Добавляем репо в список
    };

    this.fkTransformationMap = {
      clients: {
        specialization_id: 'specializations'
      },
      categories: {
        specialization_id: 'specializations'
      },
      services: {
        category_id: 'categories'
      },
      product_categories: {
        specialization_id: 'specializations'
      },
      products: {
        product_category_id: 'product_categories'
      },
      orders: {
        client_id: 'clients'
      }
    };

    // --- [DEBUG] Добавляем отладочную функцию в консоль ---
    if (process.env.DEV) {
      window.debugShowServices = servicesRepo.logAllServicesForDebugging;
    }
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
      await logAllServicesForDebugging()
    }
  }

  async _syncLocalToServer() {
    const pending = await operationsRepo.dequeue();

    if (!pending.length) {
      console.log('[Sync] Локальная очередь пуста.');
      return;
    }

    console.log(`[Sync] Найдено ${pending.length} локальных операций для отправки.`);

    for (const op of pending) {
      try {
        op.payload = op.payload ? JSON.parse(op.payload) : null;
      } catch (e) {
        console.error('[SyncService] Не удалось распарсить payload, операция пропущена:', op, e);
        continue;
      }

      const transformations = this.fkTransformationMap[op.table];
      let transformationFailed = false;

      if (transformations && (op.type === 'insert' || op.type === 'update')) {
        for (const fkField in transformations) {
          // --- ИСПРАВЛЕНИЕ ---
          // Имя "сигнального" поля, например "product_category_server_id"
          const serverFkField = fkField.replace(/_id$/, '') + '_server_id';

          if (op.payload && op.payload.hasOwnProperty(serverFkField)) {
            // Если есть "сигнальное" поле, используем его значение
            op.payload[fkField] = op.payload[serverFkField];
            // Удаляем "сигнальное" поле, чтобы не отправлять его на сервер
            delete op.payload[serverFkField];
            continue; // Переходим к следующему полю, не выполняя стандартное преобразование
          }
          // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

          if (op.payload && op.payload[fkField]) {
            const targetTable = transformations[fkField];
            const localFkId = op.payload[fkField];

            // Если localFkId null или undefined, ничего не делаем
            if (localFkId == null) continue;

            const record = await dbAdapter.query(`SELECT server_id FROM ${targetTable} WHERE id = ?`, [localFkId]);

            if (record.length > 0 && record[0].server_id) {
              op.payload[fkField] = record[0].server_id;
            } else {
              console.error(`[Sync] КРИТИЧЕСКАЯ ОШИБКА: Не удалось найти server_id для ${fkField} с локальным ID ${localFkId}. Операция пропущена.`);
              transformationFailed = true;
              break;
            }
          }
        }
      }

      if (transformationFailed) {
        continue;
      }

      try {
        const serverRes = await api.send({ operations: [op] });

        const findResult = (responseItem) => {
          if (op.type === 'insert') {
            return responseItem.local_id === op.payload.local_id;
          }
          // Для update и delete ищем по id, который был в payload
          return responseItem.id === op.payload.id;
        };

        if (Array.isArray(serverRes?.synced) && serverRes.synced.length > 0) {
          const syncResult = serverRes.synced.find(findResult);

          if (syncResult) {
            if (op.type === 'insert') {
              const repo = this.repos[op.table];
              if (repo && typeof repo.updateServerId === 'function') {
                await repo.updateServerId(op.payload.local_id, syncResult.server_id);
              }
            }
            await operationsRepo.markSynced(op, syncResult);
          } else {
             // Если сервер вернул 200, но не нашел нашу операцию, это странно, но не ошибка
            console.warn('[Sync] Сервер не вернул результат для отправленной операции, но ответил 200 OK.', op);
            // Возможно, операция уже была применена. Помечаем как синхронизированную, чтобы не зацикливаться.
            await operationsRepo.markSynced(op, { status: 'already_applied' });
          }
        } else if (Array.isArray(serverRes?.errors) && serverRes.errors.length > 0) {
          const errorResult = serverRes.errors.find(e => e.id === op.payload.id || e.local_id === op.payload.local_id);
          if (errorResult) {
            throw new Error(`Сервер вернул ошибку для операции: ${errorResult.error}`);
          }
          throw new Error('Сервер вернул массив ошибок, но не для этой операции.');
        } else {
           throw new Error('Сервер вернул пустой или некорректный ответ.');
        }
      } catch (e) {
        console.error('[SyncService] Ошибка отправки операции. Она останется в очереди.', { operation: op, error: e });
        continue;
      }
    }
  }

  async _syncServerToLocal() {
    const lastSyncedAt = await metaRepo.getLastSyncedAt();

    for (const table of Object.keys(this.repos)) {
      const repo = this.repos[table];

      try {
        const response = await api.fetchUpdates({
          table,
          since: lastSyncedAt
        });

        const records = Array.isArray(response) ? response : (Array.isArray(response?.records) ? response.records : []);

        for (const record of records) {
          await repo.applyServerRecord(record);
        }
      } catch (e) {
        console.error(`[Sync] Ошибка при получении обновлений для таблицы "${table}":`, e);
        // Не прерываем синхронизацию других таблиц
      }
    }

    await metaRepo.setLastSyncedAt(Date.now());
  }

  async fullReset() {
    console.log('[Sync] Full reset started');
    for (const table of Object.keys(this.repos)) {
      const repo = this.repos[table];
      if (typeof repo.clearAll === 'function') {
        await repo.clearAll();
      }
    }
    await metaRepo.resetLastSyncedAt();
    console.log('[Sync] Full reset finished');
  }

  async deleteLocalDB() {
    await dbAdapter.deleteDatabase();
  }
}

export default new SyncService();
