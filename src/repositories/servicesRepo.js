import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/services'
import operationsRepo from 'src/repositories/operationsRepo'

export async function getByCategoryId(categoryId) {
  const rows = await dbAdapter.query(queries.getByCategoryId, [categoryId])
  return rows
}

export async function save(service) {
  const id = service.id || uuidv4()

  const params = [
    id,
    service.server_id || null,
    service.category_id,
    service.service,
    service.price || ''
  ]

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

  const params = [
    service.service,
    service.price || '',
    service.id
  ];
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
    const params = [
      uuidv4(),
      record.id,
      localCategoryId, // Используем найденный локальный ID
      record.service,
      record.price || '',
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (record.updated_at > local.updated_at) {
    // При обновлении также нужно передавать category_id
    const updateParams = [
      record.service,
      record.price || '',
      record.updated_at,
      record.id
    ];
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
    console.log('--- [DEBUG] Содержимое таблицы `services` в локальной БД ---');
    console.table(allServices);
  } catch (e) {
    console.error('--- [DEBUG] Ошибка при чтении таблицы `services` ---', e);
  }
}
