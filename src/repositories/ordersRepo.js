import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/orders'
import operationsRepo from 'src/repositories/operationsRepo'
import { findByServerId as findSpecializationByServerId } from "src/repositories/specializationsRepo.js";
import { findByServerId as findClientByServerId } from "src/repositories/clientsRepo.js";
import { getById as getModelById } from "src/repositories/modelsRepo.js";
import { findByServerId as findModelByServerId } from "src/repositories/modelsRepo.js";
import { toEpochSeconds } from 'src/utils/timestamps.js'

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  return rows;
}

export async function getBySpecializationId(specializationId) {
  const rows = await dbAdapter.query(queries.getBySpecializationId, [specializationId])
  return rows;
}

async function getSpecializationData(order) {
  if (order.specialization_id) {
    return {
      id: order.specialization_id,
      server_id: order.specialization_server_id || null
    };
  }
  if (order.specialization_server_id) {
    const specialization = await findSpecializationByServerId(order.specialization_server_id);
    if (specialization) {
      return {
        id: specialization.id,
        server_id: specialization.server_id
      };
    }
  }
  return { id: null, server_id: null };
}

async function getClientData(order) {
  if (order.client_id) {
    return {
      id: order.client_id,
      server_id: order.client_server_id || null
    };
  }
  if (order.client_server_id) {
    const client = await findClientByServerId(order.client_server_id);
    if (client) {
      return {
        id: client.id,
        server_id: client.server_id
      };
    }
  }
  return { id: null, server_id: null };
}

export async function save(order) {
  const id = order.id || uuidv4()
  const specializationData = await getSpecializationData(order);
  const clientData = await getClientData(order);

  logger.log('Specialization data:', specializationData);
  logger.log('SelectedSpecialization: ', specializationData.server_id );


  const params = [
    id,
    order.server_id || null,
    specializationData.id,
    specializationData.server_id,
    clientData.id,
    clientData.server_id,
    order.hours || 0,
    order.minutes || 0,
    order.total_amount || 0,
    order.comments || '',
    order.user_id || null,
    order.user_order_number || null,
    order.status || 'waiting',
    order.paid || 0,
    order.model_id || null,
    order.share_token || null
  ]

  logger.log('SQL Params:', params);

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...order };
  if (order.model_id) {
    const model = await getModelById(order.model_id);
    if (model && model.server_id) {
      payloadForServer.model_server_id = model.server_id;
    }
    delete payloadForServer.model_id; // Всегда убираем локальный id; серверу шлём только model_server_id
  }
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'orders', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);

  return id
}

export async function update(order) {
  const existingOrder = await dbAdapter.queryOne(queries.getById, [order.id]);
  const specializationData = await getSpecializationData(order);
  const clientData = await getClientData(order);

  const params = [
    specializationData.id,
    specializationData.server_id,
    clientData.id,
    clientData.server_id,
    order.hours || 0,
    order.minutes || 0,
    order.total_amount || 0,
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
    if (order.model_id) {
      const model = await getModelById(order.model_id);
      if (model && model.server_id) {
        payloadForServer.model_server_id = model.server_id;
      }
      delete payloadForServer.model_id; // Всегда убираем локальный id; серверу шлём только model_server_id
    }
    // `...order` перетёр `id` локальным UUID, а серверу для UPDATE нужен именно
    // СЕРВЕРНЫЙ id: без него `/sync` отвечает `MISSING_ID_FOR_UPDATE` и правка
    // заказа не уезжает вовсе (найдено при 3.8).
    payloadForServer.id = existingOrder.server_id;
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'orders', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else {
    logger.log('Запись еще не на сервере. Обновление произойдет в рамках операции INSERT.');
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

  const recordData = {
    ...record,
    total_amount: record.total_amount || 0
  };

  let localModelId = null;
  if (record.model_id) {
    const model = await findModelByServerId(record.model_id);
    if (model) {
      localModelId = model.id;
    }
  }

  if (!existing.length) {
    const localId = uuidv4();
    const specializationData = await getSpecializationData({ specialization_server_id: record.specialization_id });
    const clientData = await getClientData({ client_server_id: record.client_id });
    const params = [
      localId,
      recordData.id,
      specializationData.id,
      specializationData.server_id,
      clientData.id,
      clientData.server_id,
      recordData.hours,
      recordData.minutes,
      recordData.total_amount,
      recordData.comments,
      recordData.user_id,
      recordData.user_order_number,
      recordData.status,
      recordData.paid,
      localModelId,
      recordData.share_token,
      toEpochSeconds(recordData.created_at),
      toEpochSeconds(recordData.updated_at)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (toEpochSeconds(recordData.updated_at) > toEpochSeconds(local.updated_at, 0)) {
    const specializationData = await getSpecializationData({ specialization_server_id: record.specialization_id });
    const clientData = await getClientData({ client_server_id: record.client_id });
    const updateParams = [
      specializationData.id,
      specializationData.server_id,
      clientData.id,
      clientData.server_id,
      recordData.hours,
      recordData.minutes,
      recordData.total_amount,
      recordData.comments,
      recordData.user_id,
      recordData.user_order_number,
      recordData.status,
      recordData.paid,
      localModelId,
      recordData.share_token,
      toEpochSeconds(recordData.updated_at),
      recordData.id
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
