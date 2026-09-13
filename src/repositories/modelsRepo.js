import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/models'
import operationsRepo from 'src/repositories/operationsRepo'
import * as specializationsRepo from 'src/repositories/specializationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  modelInsertParams,
  modelUpdateParams,
  modelInsertFromServerParams,
  modelUpdateFromServerParams,
} from 'src/database/mappers/catalog.js'

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  return rows
}

/**
 * Модели техники активного профиля (Фаза 10, строгий фильтр).
 *
 * У модели две формы FK (`specialization_id` — локальный UUID,
 * `specialization_server_id` — серверный id), поэтому ищем по обеим:
 * `server_id` специализации достаём из её локальной строки.
 *
 * @param {string} specializationId локальный UUID специализации
 * @returns {Promise<Array>}
 */
export async function getBySpecializationId(specializationId) {
  const spec = await dbAdapter.queryOne(
    'SELECT server_id FROM specializations WHERE id = ?',
    [specializationId]
  );
  const serverId = spec ? spec.server_id : null;

  return dbAdapter.query(queries.getBySpecializationId, [specializationId, serverId]);
}

export async function findByServerId(serverId) {
  const result = await dbAdapter.query(queries.findByServerId, [serverId]);
  return result.length > 0 ? result[0] : null;
}

export async function getById(id) {
    const result = await dbAdapter.query(queries.getById, [id]);
    return result.length > 0 ? result[0] : null;
}

/**
 * Идемпотентность пресета (Фаза 10, задача 10.4): учитываем и локальный UUID,
 * и серверный id в `specialization_id`.
 *
 * @param {string} specializationId локальный UUID специализации
 * @param {string} templateKey например `bike:mtb`
 * @returns {Promise<object|null>}
 */
export async function findByTemplateKey(specializationId, templateKey) {
  if (!templateKey) return null;

  const spec = await dbAdapter.queryOne(
    'SELECT server_id FROM specializations WHERE id = ?',
    [specializationId]
  );
  const serverId = spec ? spec.server_id : null;

  const rows = await dbAdapter.query(
    'SELECT * FROM equipment_models WHERE template_key = ? AND (specialization_id = ? OR specialization_id = ?)',
    [templateKey, specializationId, serverId]
  );

  return rows.length ? rows[0] : null;
}

export async function save(model) {
  const id = model.id || uuidv4()

  const params = modelInsertParams({ id, model })

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

  const params = modelUpdateParams(model);
  await dbAdapter.execute(queries.update, params);

  if (existingModel && existingModel.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingModel.server_id,
      name: model.name,
      specialization_id: model.specialization_id,
      specialization_server_id: model.specialization_server_id,
      template_key: model.template_key ?? existingModel.template_key ?? null,
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
      logger.warn(`[applyServerRecord] Не найдена локальная специализация для server_id: ${record.specialization_id}`);
    }
  }

  if (!existing.length) {
    // New record
    const localId = uuidv4();
    const params = modelInsertFromServerParams({
      localId, // local id
      serverId: record.id,
      name: record.name,
      localSpecializationId,
      // `specialization_id` на сервере nullable: без `?? null` в sql.js уходил
      // `undefined` → «tried to bind a value of an unknown type», и модель техники
      // с сервера не применялась вовсе (найдено тестом 11.2).
      specializationServerId: record.specialization_id ?? null,
      templateKey: record.template_key,
      createdAt: toEpochSeconds(record.created_at),
      updatedAt: toEpochSeconds(record.updated_at),
    });

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  // Update existing record
  const local = existing[0];
  if (toEpochSeconds(record.updated_at) > toEpochSeconds(local.updated_at, 0)) {
    const updateParams = modelUpdateFromServerParams({
      name: record.name,
      localSpecializationId,
      specializationServerId: record.specialization_id ?? null,
      templateKey: record.template_key ?? local.template_key ?? null,
      updatedAt: toEpochSeconds(record.updated_at),
      serverId: record.id,
    });
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
