import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/orders'
import operationsRepo from 'src/repositories/operationsRepo'

// Helper to convert amount from cents to roubles
const fromCents = (order) => {
  if (order && order.total_amount) {
    return { ...order, total_amount: order.total_amount / 100 };
  }
  return order;
};

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  return rows.map(fromCents);
}

export async function getBySpecializationId(specializationId) {
  const rows = await dbAdapter.query(queries.getBySpecializationId, [specializationId])
  return rows.map(fromCents);
}

export async function save(order) {
  const id = order.id || uuidv4()

  const params = [
    id,
    order.server_id || null,
    order.specialization_id || null,
    order.client_id || null,
    order.hours || 0,
    order.minutes || 0,
    (order.total_amount || 0) * 100, // Convert to cents
    order.comments || '',
    order.user_id || null,
    order.user_order_number || null,
    order.status || 'waiting',
    order.paid || 0,
    order.model_id || null,
    order.share_token || null
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
    order.specialization_id || null,
    order.client_id || null,
    order.hours || 0,
    order.minutes || 0,
    (order.total_amount || 0) * 100, // Convert to cents
    order.comments || '',
    order.user_id || null,
    order.user_order_number || null,
    order.status || 'waiting',
    order.paid || 0,
    order.model_id || null,
    order.share_token || null,
    order.id
  ];
  await dbAdapter.execute(queries.update, params);

  if (existingOrder && existingOrder.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingOrder.server_id,
      ...order
    };
    delete payloadForServer.id;
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

  const recordInCents = {
    ...record,
    total_amount: (record.total_amount || 0) * 100 // Convert to cents
  };

  if (!existing.length) {
    const localId = uuidv4();
    const params = [
      localId,
      recordInCents.id,
      recordInCents.specialization_id,
      recordInCents.client_id,
      recordInCents.hours,
      recordInCents.minutes,
      recordInCents.total_amount,
      recordInCents.comments,
      recordInCents.user_id,
      recordInCents.user_order_number,
      recordInCents.status,
      recordInCents.paid,
      recordInCents.model_id,
      recordInCents.share_token,
      recordInCents.created_at || Math.floor(Date.now() / 1000),
      recordInCents.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (recordInCents.updated_at > local.updated_at) {
    const updateParams = [
      recordInCents.specialization_id,
      recordInCents.client_id,
      recordInCents.hours,
      recordInCents.minutes,
      recordInCents.total_amount,
      recordInCents.comments,
      recordInCents.user_id,
      recordInCents.user_order_number,
      recordInCents.status,
      recordInCents.paid,
      recordInCents.model_id,
      recordInCents.share_token,
      recordInCents.updated_at,
      recordInCents.id
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
