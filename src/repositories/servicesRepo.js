import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/services'
import operationsRepo from 'src/repositories/operationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  serviceInsertParams,
  serviceUpdateParams,
  serviceInsertFromServerParams,
  serviceUpdateFromServerParams,
} from 'src/database/mappers/catalog.js'

export async function getByCategoryId(categoryId) {
  const rows = await dbAdapter.query(queries.getByCategoryId, [categoryId])
  return rows
}

export async function save(service) {
  const id = service.id || uuidv4()

  // Задача 8.3: порядок колонок — в маппере (`serviceInsertParams`), в том числе
  // `|| null` для `category_id`: если категории нет, sql.js падает на биндинге `undefined`
  // («tried to bind a value of an unknown type») — непонятной ошибкой. С null сработает
  // понятное ограничение схемы (`services.category_id NOT NULL`), тест 5.3 это фиксирует.
  const params = serviceInsertParams({ id, service })

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...service };
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'services', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);

  return id
}

export async function update(service) {
  const existingService = await dbAdapter.queryOne(queries.getById, [service.id]);

  const params = serviceUpdateParams(service);
  await dbAdapter.execute(queries.update, params);

  if (existingService && existingService.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingService.server_id,
      service: service.service,
      price: service.price
    };
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'services', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  }
}

export async function remove(id) {
  const service = await dbAdapter.queryOne(queries.getById, [id]);

  if (service && service.server_id) {
    const opId = uuidv4();
    const opPayload = JSON.stringify({ id: service.server_id });
    const opParams = [opId, 'delete', 'services', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else if (service) {
    await operationsRepo.removeByLocalId('services', id);
  }

  await dbAdapter.execute(queries.delete, [id]);
}

export async function applyServerRecord(record) {
  // Находим локальный ID категории по серверному ID, который пришел в записи об услуге
  const category = await dbAdapter.queryOne(
    'SELECT id FROM categories WHERE server_id = ?',
    [record.category_id]
  );

  if (!category) {
    console.error(`[Sync] Не удалось найти локальную категорию с server_id: ${record.category_id}. Услуга "${record.service}" пропущена.`);
    return;
  }
  const localCategoryId = category.id;

  const existing = await dbAdapter.query(`
    SELECT * FROM services WHERE server_id = ?
  `, [record.id]);

  if (!existing.length) {
    const params = serviceInsertFromServerParams({
      localId: uuidv4(),
      serverId: record.id,
      localCategoryId, // Используем найденный локальный ID
      service: record.service,
      price: record.price,
      createdAt: toEpochSeconds(record.created_at),
      updatedAt: toEpochSeconds(record.updated_at),
    });

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (toEpochSeconds(record.updated_at) > toEpochSeconds(local.updated_at, 0)) {
    // При обновлении также передаём category_id: запрос `queries.updateFromServer`
    // обновляет его четвёртым параметром. Раньше значение не передавалось вовсе —
    // запрос падал на нехватке аргументов (найдено при 8.3).
    const updateParams = serviceUpdateFromServerParams({
      localCategoryId,
      service: record.service,
      price: record.price,
      updatedAt: toEpochSeconds(record.updated_at),
      serverId: record.id,
    });
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function clearAll() {
  await dbAdapter.execute('DELETE FROM services');
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}

/**
 * Отладочная функция для вывода всех записей из таблицы services в консоль.
 */
export async function logAllServicesForDebugging() {
  try {
    const allServices = await dbAdapter.query(queries.getAll);
    logger.log('--- [DEBUG] Содержимое таблицы `services` в локальной БД ---');
    logger.table(allServices);
  } catch (e) {
    console.error('--- [DEBUG] Ошибка при чтении таблицы `services` ---', e);
  }
}
