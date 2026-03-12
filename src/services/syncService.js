// services/syncService.js

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
              console.warn(`[Sync] Нет server_id для ${fkField} (локальный ID ${localFkId}). Операция будет отложена.`);

              // #region agent log
              fetch('http://127.0.0.1:7252/ingest/657caac1-884c-459e-a159-d5ee1c7cad86', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Debug-Session-Id': 'c685cd',
                },
                body: JSON.stringify({
                  sessionId: 'c685cd',
                  runId: 'pre-fix',
                  hypothesisId: 'H1',
                  location: 'syncService.js:fk-transform',
                  message: '_syncLocalToServer missing server_id for FK',
                  data: {
                    table: op.table,
                    type: op.type,
                    fkField,
                    localFkId,
                    payloadBeforeSkip: op.payload,
                  },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion agent log

              canSend = false;
              break;
            }
          }
        }
      }

      if (!canSend) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/26bc172a-ccb5-4398-b591-9faafa31958b', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '674ea3',
          },
          body: JSON.stringify({
            sessionId: '674ea3',
            runId: 'pre-fix',
            hypothesisId: 'H5',
            location: 'syncService.js:160',
            message: '_syncLocalToServer skipping op without server_id FK',
            data: {
              table: op.table,
              type: op.type,
              payload: op.payload,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion agent log

        continue;
      }

      preparedOps.push(op);
    }

    if (!preparedOps.length) {
      console.log('[Sync] После подготовки не осталось операций для отправки.');
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

      // #region agent log
      // Логируем операции order_service перед отправкой на сервер
      const orderServiceOps = preparedOps
        .filter((op) => op.table === 'order_service')
        .map((op) => ({
          type: op.type,
          payload: op.payload,
        }));

      fetch('http://127.0.0.1:7252/ingest/657caac1-884c-459e-a159-d5ee1c7cad86', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'c685cd',
        },
        body: JSON.stringify({
          sessionId: 'c685cd',
          runId: 'pre-fix',
          hypothesisId: 'H2',
          location: 'syncService.js:before-api-send',
          message: '_syncLocalToServer order_service operations before api.send',
          data: {
            count: orderServiceOps.length,
            operations: orderServiceOps,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log

    // #region agent log
    // Логируем порядок операций перед отправкой
    fetch('http://127.0.0.1:7242/ingest/26bc172a-ccb5-4398-b591-9faafa31958b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '674ea3',
      },
      body: JSON.stringify({
        sessionId: '674ea3',
        runId: 'pre-fix',
        hypothesisId: 'H6',
        location: 'syncService.js:185',
        message: '_syncLocalToServer operations order before api.send',
        data: {
          operations: preparedOps.map((op) => ({
            table: op.table,
            type: op.type,
            local_id: op.payload?.local_id ?? null,
            id: op.payload?.id ?? null,
          })),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    // #region agent log
    // Логируем все подготовленные операции перед отправкой
    for (const op of preparedOps) {
      fetch('http://127.0.0.1:7242/ingest/26bc172a-ccb5-4398-b591-9faafa31958b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '674ea3',
        },
        body: JSON.stringify({
          sessionId: '674ea3',
          runId: 'pre-fix',
          hypothesisId: 'H1',
          location: 'syncService.js:149',
          message: '_syncLocalToServer before api.send',
          data: {
            table: op.table,
            type: op.type,
            payload: op.payload,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion agent log

    let serverRes;

    try {
      serverRes = await api.send({ operations: preparedOps });

      // #region agent log
      // Логируем ответ сервера для всех операций
      for (const op of preparedOps) {
        fetch('http://127.0.0.1:7242/ingest/26bc172a-ccb5-4398-b591-9faafa31958b', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': '674ea3',
          },
          body: JSON.stringify({
            sessionId: '674ea3',
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'syncService.js:151',
            message: '_syncLocalToServer after api.send',
            data: {
              table: op.table,
              type: op.type,
              payload: op.payload,
              serverRes,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
      // #endregion agent log

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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/26bc172a-ccb5-4398-b591-9faafa31958b', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Debug-Session-Id': '674ea3',
            },
            body: JSON.stringify({
              sessionId: '674ea3',
              runId: 'pre-fix',
              hypothesisId: 'H3',
              location: 'syncService.js:178',
              message: '_syncLocalToServer serverRes.errors for operation',
              data: {
                table: op.table,
                type: op.type,
                payload: op.payload,
                errorResult,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion agent log

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/26bc172a-ccb5-4398-b591-9faafa31958b', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Debug-Session-Id': '674ea3',
            },
            body: JSON.stringify({
              sessionId: '674ea3',
              runId: 'pre-fix',
              hypothesisId: 'H4',
              location: 'syncService.js:187',
              message: '_syncLocalToServer catch error while sending operation',
              data: {
                table: op.table,
                type: op.type,
                payload: op.payload,
                errorMessage: `Сервер вернул ошибку для операции: ${errorResult.error}`,
              },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion agent log

          console.error('[SyncService] Ошибка отправки операции. Она останется в очереди.', {
            operation: op,
            error: new Error(`Сервер вернул ошибку для операции: ${errorResult.error}`),
          });

          // Не помечаем как синхронизированную, оставляем в очереди
          continue;
        }

        // Если сервер ничего не вернул про эту операцию, считаем, что она уже была применена
        console.warn('[Sync] Сервер не вернул результат для отправленной операции, но ответил 200 OK.', op);
        await operationsRepo.markSynced(op, { status: 'already_applied' });
      }
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/26bc172a-ccb5-4398-b591-9faafa31958b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': '674ea3',
        },
        body: JSON.stringify({
          sessionId: '674ea3',
          runId: 'pre-fix',
          hypothesisId: 'H4',
          location: 'syncService.js:187',
          message: '_syncLocalToServer catch error while sending operation',
          data: {
            table: 'batch',
            type: 'batch',
            payload: null,
            errorMessage: e?.message,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion agent log

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
