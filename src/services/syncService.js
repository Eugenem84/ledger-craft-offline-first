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

    // Карта для преобразования локальных ID в серверные перед отправкой.
    // Ключ - имя таблицы, значение - объект, где ключ - поле с внешним ключом,
    // а значение - таблица, на которую он ссылается.
    this.fkTransformationMap = {
      clients: {
        specialization_id: 'specializations'
      }
      // Например, в будущем:
      // orders: { client_id: 'clients', service_id: 'services' }
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

    if (!pending.length) {
      console.log('[Sync] Локальная очередь пуста. Нет операций для отправки на сервер.');
      return;
    }

    console.log(`[Sync] Найдено ${pending.length} локальных операций для отправки на сервер.`);

    for (const op of pending) {
      // Важно: payload из базы приходит как JSON-строка. Его нужно парсить.
      try {
        // Преобразуем строку в объект. Если payload пустой, будет null.
        op.payload = op.payload ? JSON.parse(op.payload) : null;
      } catch (e) {
        console.error('[SyncService] Не удалось распарсить payload, операция пропущена:', op, e);
        // Если payload "сломан", мы не можем его обработать. Пропускаем эту операцию.
        continue;
      }

      // --- Универсальная трансформация Payload перед отправкой ---
      const transformations = this.fkTransformationMap[op.table];
      let transformationFailed = false;

      if (transformations && (op.type === 'insert' || op.type === 'update')) {
        for (const fkField in transformations) {
          if (op.payload && op.payload[fkField]) {
            const targetTable = transformations[fkField];
            const localFkId = op.payload[fkField];

            console.log(`[Sync] Трансформация: ищем server_id для поля ${fkField} (${localFkId}) в таблице ${targetTable}.`);

            const record = await dbAdapter.query(`SELECT server_id FROM ${targetTable} WHERE id = ?`, [localFkId]);

            if (record.length > 0 && record[0].server_id) {
              const serverFkId = record[0].server_id;
              console.log(`[Sync] Трансформация: ID найден (${serverFkId}). Заменяем в payload.`);
              op.payload[fkField] = serverFkId;
            } else {
              console.error(`[Sync] КРИТИЧЕСКАЯ ОШИБКА: Не удалось найти server_id для ${fkField} с локальным ID ${localFkId}. ` +
                `Операция для таблицы "${op.table}" не может быть синхронизирована. Операция пропущена.`);
              transformationFailed = true;
              break; // Прерываем цикл трансформаций для этой операции
            }
          }
        }
      }

      if (transformationFailed) {
        continue; // Пропускаем текущую операцию и переходим к следующей
      }
      // --- Конец трансформации ---

      // Перед отправкой на сервер удаляем из payload временный локальный ID,
      // который использовался для связи. Серверу он не нужен.
      if (op.type === 'insert' && op.payload?.local_id) {
        // Мы не удаляем его из объекта op.payload, а создаем копию без него для отправки
        // т.к. op.payload.local_id еще понадобится в markSynced
      }

      try {
        console.log('[Sync] -> Отправка операции на сервер:', op);
        const serverRes = await api.send(op);
        console.log('[Sync] <- Сервер успешно обработал операцию. Ответ:', serverRes);
        await operationsRepo.markSynced(op, serverRes);
      } catch (e) {
        console.error('[SyncService] Ошибка отправки операции. Она останется в очереди для следующей попытки.', {
          operation: op,
          error: e
        });
        // Не прерываем весь цикл, а просто переходим к следующей операции
        continue;
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
