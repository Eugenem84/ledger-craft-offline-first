import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/categories'
import operationsRepo from 'src/repositories/operationsRepo'

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  return rows
}

export async function save(category) {
  const id = category.id || uuidv4()

  const params = [
    id,
    category.server_id || null,
    category.specialization_id || null,
    category.category_name
  ]

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...category };
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'categories', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);

  return id
}

export async function update(category) {
  const existingCategory = await dbAdapter.queryOne(queries.getById, [category.id]);

  const params = [
    category.category_name,
    category.id
  ];
  await dbAdapter.execute(queries.update, params);

  if (existingCategory && existingCategory.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingCategory.server_id,
      category_name: category.category_name,
    };
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'categories', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  }
}


export async function remove(id) {
  const category = await dbAdapter.queryOne(queries.getById, [id]);

  if (category && category.server_id) {
    const opId = uuidv4();
    const opPayload = JSON.stringify({ id: category.server_id });
    const opParams = [opId, 'delete', 'categories', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else if (category) {
    await operationsRepo.removeByLocalId('categories', id);
  }

  await dbAdapter.execute(queries.delete, [id]);
}

export async function applyServerRecord(record) {
  const existing = await dbAdapter.query(`
    SELECT * FROM categories WHERE server_id = ?
  `, [record.id]);

  if (!existing.length) {
    const localId = uuidv4();
    const params = [
      localId,
      record.id,
      record.specialization_id || null,
      record.category_name,
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (record.updated_at > local.updated_at) {
    const updateParams = [
      record.category_name,
      record.updated_at,
      record.id
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
