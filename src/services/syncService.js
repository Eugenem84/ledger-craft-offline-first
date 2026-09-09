// services/syncService.js

import { logger } from 'src/utils/logger'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter';
import api from 'src/services/api';
import * as metaRepo from 'src/repositories/metaRepo';
import operationsRepo from 'src/repositories/operationsRepo';

import * as clientsRepo from 'src/repositories/clientsRepo';
import * as specializationsRepo from 'src/repositories/specializationsRepo';
import * as categoriesRepo from 'src/repositories/categoriesRepo';
import * as servicesRepo from 'src/repositories/servicesRepo';
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo';
import * as productsRepo from 'src/repositories/productsRepo';
import * as ordersRepo from 'src/repositories/ordersRepo';
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js';
import * as modelsRepo from 'src/repositories/modelsRepo';

import { logAllServicesForDebugging } from 'src/repositories/servicesRepo';

class SyncService {
  constructor() {
    this.syncing = false;

    this.repos = {
      specializations: specializationsRepo,
      categories: categoriesRepo,
      product_categories: productCategoriesRepo,
      equipment_models: modelsRepo,
      clients: clientsRepo,
      services: servicesRepo,
      products: productsRepo,
      orders: ordersRepo,
      order_service: orderServiceRepo,
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
        client_id: 'clients',
        specialization_id: 'specializations',
        model_id: 'equipment_models'
      },
      order_service: {
        order_id: 'orders',
        service_id: 'services'
      },
      equipment_models: {
        specialization_id: 'specializations'
      }
    };

    // --- [DEBUG] Добавляем отладочную функцию в консоль ---
    if (process.env.DEV) {
      window.debugShowServices = servicesRepo.logAllServicesForDebugging;
    }
  }

  async sync() {
    logger.log('[Sync] start');

    if (this.syncing) {
      logger.log('[Sync] already syncing');
      return;
    }

    this.syncing = true;

    try {
      // Выполняем синхронизацию локальных данных на сервер дважды.
      // Первый проход отправляет родительские записи (например, orders).
      // Второй проход отправляет дочерние записи (например, order_service),
      // которые не могли быть отправлены в первый раз из-за отсутствия server_id у родительских.
      await this._syncLocalToServer();
      await this._syncLocalToServer();

      await this._syncServerToLocal();
    } catch (e) {
      console.error('[SyncService] Ошибка синхронизации:', e);
    } finally {
      this.syncing = false;
      logger.log('[Sync] end');
      await logAllServicesForDebugging()
    }
  }

  async _syncLocalToServer() {
    const pending = await operationsRepo.dequeue();

    if (!pending.length) {
      logger.log('[Sync] Локальная очередь пуста.');
      return;
    }

    logger.log(`[Sync] Найдено ${pending.length} локальных операций для отправки.`);

    // Подготавливаем все операции (парсим payload и трансформируем внешние ключи)
    const preparedOps = [];

    for (const op of pending) {
      try {
        op.payload = op.payload ? JSON.parse(op.payload) : null;
      } catch (e) {
        console.error('[SyncService] Не удалось распарсить payload, операция пропущена:', op, e);
        continue;
      }

      const transformations = this.fkTransformationMap[op.table];
      let canSend = true;

      if (transformations && (op.type === 'insert' || op.type === 'update')) {
        for (const fkField in transformations) {
          // --- ИСПРАВЛЕНИЕ ---
          // Имя "сигнального" поля, например "product_category_server_id"
          const serverFkField = fkField.replace(/_id$/, '') + '_server_id';

          if (op.payload && Object.prototype.hasOwnProperty.call(op.payload, serverFkField)) {
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
              // Модель ещё не синхронизирована или не найдена — откладываем операцию до следующей синхронизации
              logger.warn(`[Sync] Нет server_id для ${fkField} (локальный ID ${localFkId}). Операция будет отложена.`);

              canSend = false;
              break;
            }
          }
        }
      }

      if (!canSend) {

        continue;
      }

      preparedOps.push(op);
    }

    if (!preparedOps.length) {
      logger.log('[Sync] После подготовки не осталось операций для отправки.');
      return;
    }

    // Сортируем операции по зависимостям таблиц, чтобы сначала отправлять "родительские" записи
    const tableOrder = [
      'specializations',
      'categories',
      'product_categories',
      'equipment_models',
      'clients',
      'services',
      'products',
      'orders',
      'order_service',
    ];

    const getPriority = (table) => {
      const idx = tableOrder.indexOf(table);
      return idx === -1 ? tableOrder.length : idx;
    };

    preparedOps.sort((a, b) => getPriority(a.table) - getPriority(b.table));

    let serverRes;

    try {
      serverRes = await api.send({ operations: preparedOps });

      const synced = Array.isArray(serverRes?.synced) ? serverRes.synced : [];
      const errors = Array.isArray(serverRes?.errors) ? serverRes.errors : [];

      for (const op of preparedOps) {
        const findResult = (responseItem) => {
          if (op.type === 'insert') {
            return responseItem.local_id === op.payload.local_id;
          }
          // Для update и delete ищем по id, который был в payload
          return responseItem.id === op.payload.id;
        };

        const syncResult = synced.find(findResult);

        if (syncResult) {
          if (op.type === 'insert') {
            const repo = this.repos[op.table];
            if (repo && typeof repo.updateServerId === 'function') {
              await repo.updateServerId(op.payload.local_id, syncResult.server_id);
            }
          }
          await operationsRepo.markSynced(op, syncResult);
          continue;
        }

        const errorResult = errors.find(e => e.id === op.payload.id || e.local_id === op.payload.local_id);

        if (errorResult) {

          console.error('[SyncService] Ошибка отправки операции. Она останется в очереди.', {
            operation: op,
            error: new Error(`Сервер вернул ошибку для операции: ${errorResult.error}`),
          });

          // Не помечаем как синхронизированную, оставляем в очереди
          continue;
        }

        // Если сервер ничего не вернул про эту операцию, считаем, что она уже была применена
        logger.warn('[Sync] Сервер не вернул результат для отправленной операции, но ответил 200 OK.', op);
        await operationsRepo.markSynced(op, { status: 'already_applied' });
      }
    } catch (e) {

      console.error('[SyncService] Ошибка отправки операций. Они останутся в очереди.', e);
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
    logger.log('[Sync] Full reset started');
    for (const table of Object.keys(this.repos)) {
      const repo = this.repos[table];
      if (typeof repo.clearAll === 'function') {
        await repo.clearAll();
      }
    }
    await metaRepo.resetLastSyncedAt();
    logger.log('[Sync] Full reset finished');
  }

  async deleteLocalDB() {
    await dbAdapter.deleteDatabase();
  }
}

export default new SyncService();
