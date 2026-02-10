import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/product-categories'
import operationsRepo from 'src/repositories/operationsRepo'

export async function getBySpecializationId(specializationId) {
  const rows = await dbAdapter.query(queries.getBySpecializationId, [specializationId])
  return rows
}

export async function save(category) {
  const id = category.id || uuidv4()

  const params = [
    id,
    category.server_id || null,
    category.specialization_id || null,
    category.name
  ]

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...category };
  delete payloadForServer.id;
  const opId = uuidv4();
  // `local_id` нужен `syncService` для сопоставления ответа от сервера.
  // Серверный SyncController его просто использует для ответа, но не для вставки в БД.
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  // Имя таблицы должно быть в snake_case. Это была основная ошибка.
  const opParams = [opId, 'insert', 'product_categories', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);

  return id
}

export async function update(category) {
  const existingCategory = await dbAdapter.queryOne(queries.getById, [category.id]);

  const params = [
    category.name,
    category.id
  ];
  await dbAdapter.execute(queries.update, params);

  if (existingCategory && existingCategory.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingCategory.server_id,
      name: category.name,
    };
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'product_categories', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  }
}


export async function remove(id) {
  const category = await dbAdapter.queryOne(queries.getById, [id]);

  if (category && category.server_id) {
    const opId = uuidv4();
    const opPayload = JSON.stringify({ id: category.server_id });
    const opParams = [opId, 'delete', 'product_categories', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else if (category) {
    await operationsRepo.removeByLocalId('product_categories', id);
  }

  await dbAdapter.execute(queries.delete, [id]);
}

export async function applyServerRecord(record) {
  const existing = await dbAdapter.query(`
    SELECT * FROM product_categories WHERE server_id = ?
  `, [record.id]);

  if (!existing.length) {
    const localId = uuidv4();
    const params = [
      localId,
      record.id,
      record.specialization_id || null,
      record.name,
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (record.updated_at > local.updated_at) {
    const updateParams = [
      record.name,
      record.updated_at,
      record.id
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
