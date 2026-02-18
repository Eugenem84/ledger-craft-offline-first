import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/models'
import operationsRepo from 'src/repositories/operationsRepo'
import * as specializationsRepo from 'src/repositories/specializationsRepo'

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  return rows
}

export async function findByServerId(serverId) {
  const result = await dbAdapter.query(queries.findByServerId, [serverId]);
  return result.length > 0 ? result[0] : null;
}

export async function getById(id) {
    const result = await dbAdapter.query(queries.getById, [id]);
    return result.length > 0 ? result[0] : null;
}

export async function save(model) {
  const id = model.id || uuidv4()

  const params = [
    id,
    model.server_id || null,
    model.name,
    model.specialization_id || null,
    model.specialization_server_id || null,
  ]

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...model };
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'equipment_models', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);

  return id
}

export async function update(model) {
  const existingModel = await dbAdapter.queryOne(queries.getById, [model.id]);

  const params = [
    model.name,
    model.specialization_id || null,
    model.specialization_server_id || null,
    model.id // for `WHERE id = ?`
  ];
  await dbAdapter.execute(queries.update, params);

  if (existingModel && existingModel.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingModel.server_id,
      name: model.name,
      specialization_id: model.specialization_id,
      specialization_server_id: model.specialization_server_id,
    };
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'equipment_models', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  }
}


export async function remove(id) {
  const model = await dbAdapter.queryOne(queries.getById, [id]);

  if (model && model.server_id) {
    const opId = uuidv4();
    const opPayload = JSON.stringify({ id: model.server_id });
    const opParams = [opId, 'delete', 'equipment_models', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else if (model) {
    await operationsRepo.removeByLocalId('equipment_models', id);
  }

  await dbAdapter.execute(queries.delete, [id]);
}

export async function applyServerRecord(record) {
  const existing = await dbAdapter.query(queries.findByServerId, [record.id]);

  let localSpecializationId = null;
  if (record.specialization_id) {
    const specialization = await specializationsRepo.findByServerId(record.specialization_id);
    if (specialization) {
      localSpecializationId = specialization.id;
    } else {
      console.warn(`[applyServerRecord] Не найдена локальная специализация для server_id: ${record.specialization_id}`);
    }
  }

  if (!existing.length) {
    // New record
    const localId = uuidv4();
    const params = [
      localId,           // local id
      record.id,         // server_id
      record.name,
      localSpecializationId,
      record.specialization_id, // specialization_server_id
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  // Update existing record
  const local = existing[0];
  if (new Date(record.updated_at) > new Date(local.updated_at)) {
    const updateParams = [
      record.name,
      localSpecializationId,
      record.specialization_id, // specialization_server_id
      record.updated_at,
      record.id // server_id for WHERE
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
