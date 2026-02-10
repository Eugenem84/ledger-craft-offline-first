import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/orders'
import operationsRepo from 'src/repositories/operationsRepo'

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  return rows
}

export async function getBySpecializationId(specializationId) {
  const rows = await dbAdapter.query(queries.getBySpecializationId, [specializationId])
  return rows
}

export async function save(order) {
  const id = order.id || uuidv4()

  const params = [
    id,
    order.server_id || null,
    order.client_id || null,
    order.total_amount,
    order.status
  ]

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...order };
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'orders', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);

  return id
}

export async function update(order) {
  const existingOrder = await dbAdapter.queryOne(queries.getById, [order.id]);

  const params = [
    order.client_id || null,
    order.total_amount,
    order.status,
    order.id
  ];
  await dbAdapter.execute(queries.update, params);

  if (existingOrder && existingOrder.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingOrder.server_id,
      client_id: order.client_id,
      total_amount: order.total_amount,
      status: order.status
    };
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'orders', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else {
    console.log('Запись еще не на сервере. Обновление произойдет в рамках операции INSERT.');
  }
}

export async function remove(id) {
  const order = await dbAdapter.queryOne(queries.getById, [id]);

  if (order && order.server_id) {
    const opId = uuidv4();
    const opPayload = JSON.stringify({ id: order.server_id });
    const opParams = [opId, 'delete', 'orders', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else if (order) {
    await operationsRepo.removeByLocalId('orders', id);
  }

  await dbAdapter.execute(queries.delete, [id]);
}

export async function applyServerRecord(record) {
  const existing = await dbAdapter.query(`
    SELECT * FROM orders WHERE server_id = ?
  `, [record.id]);

  if (!existing.length) {
    const localId = uuidv4();
    const params = [
      localId,
      record.id,
      record.client_id || null,
      record.total_amount,
      record.status,
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (record.updated_at > local.updated_at) {
    const updateParams = [
      record.client_id || null,
      record.total_amount,
      record.status,
      record.updated_at,
      record.id
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
