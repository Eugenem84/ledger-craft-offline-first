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
import {
  orderInsertParams,
  orderUpdateParams,
  orderInsertFromServerParams,
  orderUpdateFromServerParams,
} from 'src/database/mappers/orders.js'

/**
 * Поля, которые приходят из JOIN-выборок репозитория (`getAll`/`getById`/
 * `getBySpecializationId` добавляют `client_name`/`client_phone`), но которых НЕТ
 * в таблице `orders` на сервере.
 *
 * ⚠️ Дефект живого прогона (11.6): стор отдаёт наверх записи вместе с этими
 * вычисляемыми полями, `useOrdersStore.update` мержит их в объект, и payload
 * синка уезжал с ними. Сервер отвечал
 * `DATABASE_ERROR: column "client_name" of relation "orders" does not exist`,
 * операция помечалась pending и оставалась в очереди навсегда — правка статуса
 * или оплаты не доезжала.
 */
const DERIVED_ORDER_FIELDS = ['client_name', 'client_phone', 'model_name']

/** Копия заказа без вычисляемых полей — для payload'а синка. */
function toServerPayload(order) {
  const payload = { ...order }
  for (const field of DERIVED_ORDER_FIELDS) {
    delete payload[field]
  }
  return payload
}

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

/**
 * Модель техники заказа в виде пары «локальный UUID + серверный id» — та же конвенция,
 * что у клиента и специализации.
 *
 * `server_id = null` при известном локальном id означает «модель ещё не на сервере»:
 * по этому признаку `syncService` строит зависимость «модель → заказ» и сам подставит
 * серверный id после отправки модели (задача 11.2).
 */
async function getModelData(order) {
  if (order.model_id) {
    const model = await getModelById(order.model_id);
    return { id: order.model_id, server_id: model?.server_id ?? null };
  }
  if (order.model_server_id) {
    const model = await findModelByServerId(order.model_server_id);
    if (model) {
      return { id: model.id, server_id: model.server_id };
    }
    return { id: null, server_id: order.model_server_id };
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
  const modelData = await getModelData(order);

  // Задача 8.3: позиционные аргументы собирает именованный маппер — порядок колонок
  // живёт в `src/database/mappers/orders.js`, а не в репозитории.
  const params = orderInsertParams({
    id,
    order,
    specialization: specializationData,
    client: clientData,
    // Пара «модель + её серверный id» — как у клиента и специализации (задача 11.2).
    modelServerId: modelData.server_id,
  })

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = toServerPayload(order);
  if (order.model_id || modelData.server_id != null) {
    // Задача 11.2: локальный `model_id` остаётся в payload, а сигнальное поле
    // `model_server_id` отдаём даже когда оно `null` — «модель ещё не на сервере».
    // syncService по `null` сам переведёт локальный id в серверный (после отправки
    // самой модели) — как `productsRepo` с `product_category_server_id`.
    // Раньше `model_id` удалялся всегда, поэтому заказ, созданный офлайн с новой
    // моделью техники, уезжал на сервер без неё — связь терялась молча.
    payloadForServer.model_id = modelData.id ?? payloadForServer.model_id ?? null;
    payloadForServer.model_server_id = modelData.server_id ?? null;
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
  const modelData = await getModelData(order);

  const params = orderUpdateParams({
    order,
    specialization: specializationData,
    client: clientData,
    modelServerId: modelData.server_id,
  });
  await dbAdapter.execute(queries.update, params);

  if (existingOrder && existingOrder.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingOrder.server_id,
      ...toServerPayload(order)
    };
    if (order.model_id || modelData.server_id != null) {
      // Задача 11.2: см. комментарий в `save` — `null` в сигнальном поле означает
      // «модель ещё не на сервере», и syncService переведёт локальный id сам.
      payloadForServer.model_id = modelData.id ?? payloadForServer.model_id ?? null;
      payloadForServer.model_server_id = modelData.server_id ?? null;
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
    const params = orderInsertFromServerParams(recordData, {
      localId,
      specialization: specializationData,
      client: clientData,
      localModelId,
      modelServerId: record.model_id ?? null,
    });

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (toEpochSeconds(recordData.updated_at) > toEpochSeconds(local.updated_at, 0)) {
    const specializationData = await getSpecializationData({ specialization_server_id: record.specialization_id });
    const clientData = await getClientData({ client_server_id: record.client_id });
    const updateParams = orderUpdateFromServerParams(recordData, {
      specialization: specializationData,
      client: clientData,
      localModelId,
      modelServerId: record.model_id ?? null,
    });
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
