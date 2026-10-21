import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/clients'
import operationsRepo from 'src/repositories/operationsRepo'
import * as specializationsRepo from 'src/repositories/specializationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  clientInsertParams,
  clientUpdateParams,
  clientInsertFromServerParams,
  clientUpdateFromServerParams,
} from 'src/database/mappers/catalog.js'

//logger.log('queries.insert:', queries.insert)
logger.log('!!! queries object:', queries)

/** Текст ошибки «клиент без имени» — его показывает интерфейс. */
export const CLIENT_NAME_REQUIRED_MESSAGE =
  'Укажите имя клиента — без имени запись не сохранится и не уедет на сервер'

/**
 * Приводит имя клиента к пригодному для сервера виду.
 *
 * Зачем проверка в репозитории, а не только в форме (живой лог 19.10.2026):
 * мастер создал клиента с пустым именем, локальная таблица допускает `''`,
 * а Laravel превращает пустую строку в `null` (middleware `ConvertEmptyStringsToNull`)
 * и PostgreSQL отвечает `23502 not-null constraint`. Операция висела в очереди и
 * уходила на сервер снова и снова, забивая журнал одинаковыми ошибками.
 *
 * @param {*} name
 * @returns {string}
 * @throws {Error} с кодом `CLIENT_NAME_REQUIRED`, если имени нет
 */
export function normalizeClientName(name) {
  const text = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) {
    const error = new Error(CLIENT_NAME_REQUIRED_MESSAGE)
    error.code = 'CLIENT_NAME_REQUIRED'
    throw error
  }

  return text
}

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  logger.log('repo rows: ',rows)
  return rows
}

/**
 * Клиенты активного профиля (Фаза 10, строгий фильтр).
 *
 * Локально созданный клиент хранит в `specialization_id` локальный UUID, а
 * `applyServerRecord` пишет и UUID, и серверный id в `specialization_server_id`.
 * Поэтому ищем по обеим формам FK: сначала достаём `server_id` специализации.
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

// Чтение клиента по локальному UUID (нужно, например, OrderDetailsPage после
// создания клиента прямо из заказа). Запрос `queries.getById` был, но не экспортирован —
// из-за этого SPA-сборка падала на «"getById" is not exported by clientsRepo».
export async function getById(id) {
  const result = await dbAdapter.query(queries.getById, [id]);
  return result.length > 0 ? result[0] : null;
}

export async function save(client) {
  // Генерируем новый локальный UUID для клиента, если он создается впервые.
  // Если клиент уже имеет id (например, при редактировании), используется существующий.
  const id = client.id || uuidv4()

  // Имя обязательно и на клиенте (см. `normalizeClientName`): без него сервер
  // отвечает `not-null constraint`, а операция крутится в очереди бесконечно.
  const normalized = { ...client, name: normalizeClientName(client.name) }

  // Готовим параметры для SQL-запроса на вставку (порядок колонок — в маппере, 8.3).
  const params = clientInsertParams({ id, client: normalized })

  // Выполняем SQL-запрос для сохранения клиента в локальной базе данных.
  await dbAdapter.execute(queries.insert, params)

  // Добавляем операцию 'insert' в очередь для последующей отправки на сервер.
  // В payload для сервера не должно быть локального id.
  // Но нам нужно знать этот id, чтобы потом обновить запись, когда сервер вернет server_id.
  // Поэтому мы сохраняем его в payload под ключом `local_id`,
  // который будет удален перед отправкой на сервер.
  const payloadForServer = { ...normalized };
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'clients', opPayload, Date.now()];

  // Вызываем метод репозитория операций для добавления в очередь
  await operationsRepo.enqueue(opParams);

  // --- Добавлено для отладки ---
  const allClients = await dbAdapter.query('SELECT * FROM clients');
  logger.log('--- Clients in DB After Save ---');
  logger.table(allClients);
  logger.log('--------------------------------');

  const queue = await dbAdapter.query('SELECT * FROM operations ORDER BY created_at ASC');
  logger.log('--- Operations Queue After Save ---');
  logger.table(queue);
  logger.log('---------------------------------');
  // --- Конец отладочного кода ---

  // Возвращаем локальный ID созданного или обновленного клиента.
  return id
}

export async function update(client) {
  // 1. Получаем текущую запись из БД, чтобы не потерять server_id и др. поля
  const existingClient = await dbAdapter.queryOne(queries.getById, [client.id]);

  if (!existingClient) {
    const error = new Error('Клиент не найден — обновите список и попробуйте снова');
    error.code = 'CLIENT_NOT_FOUND';
    throw error;
  }

  // 2. Собираем итоговые значения: поля, которых нет в правке, остаются прежними.
  //    Раньше частичное обновление (`{ phone }`) записывало `name = undefined`:
  //    локально это падало на NOT NULL, а в payload уезжал `name: null` — сервер
  //    отвечал `23502 not-null constraint` и операция повторялась бесконечно.
  const merged = {
    name: normalizeClientName(client.name ?? existingClient.name),
    phone: client.phone ?? existingClient.phone ?? '',
    specialization_id: client.specialization_id ?? existingClient.specialization_id ?? null,
    specialization_server_id:
      client.specialization_server_id ?? existingClient.specialization_server_id ?? null,
  };

  // 3. Обновляем локальную запись итоговыми значениями (не «только переданными»).
  await dbAdapter.execute(queries.update, clientUpdateParams({ id: client.id, client: merged }));

  // 4. Готовим операцию для сервера
  if (existingClient.server_id) {
    // Если есть server_id, значит, запись синхронизирована.
    // Готовим операцию 'update' для сервера.
    const opId = uuidv4();
    // В payload для сервера используем server_id как 'id'
    const payloadForServer = {
      id: existingClient.server_id,
      ...merged
    };
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'clients', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else {
    // Запись создана офлайн: на сервер поедет операция `insert`, и её payload надо
    // обновить — иначе правка (например, исправленное пустое имя) не уедет никогда,
    // а сервер будет отклонять старую версию записи (живой лог 19.10.2026).
    await operationsRepo.updateInsertPayload('clients', client.id, merged);
  }
}


export async function remove(id) {
  // Получаем клиента по его локальному ID
  const client = await dbAdapter.queryOne(queries.getById, [id]);

  if (client && client.server_id) {
    // Если у клиента есть server_id, значит он был синхронизирован.
    // Ставим в очередь операцию 'delete' для сервера.
    const opId = uuidv4();
    // Для удаления на сервере используем server_id.
    const opPayload = JSON.stringify({ id: client.server_id });
    const opParams = [opId, 'delete', 'clients', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else if (client) {
    // Если у клиента нет server_id, значит он был создан оффлайн
    // и еще не был синхронизирован с сервером.
    // В этом случае нам не нужно отправлять 'delete' на сервер.
    // Вместо этого мы должны найти и удалить из очереди операцию 'insert'.
    await operationsRepo.removeByLocalId('clients', id);
  }

  // В любом случае удаляем клиента из локальной базы данных.
  await dbAdapter.execute(queries.delete, [id]);
}

/**
 * Полностью очищает справочник клиентов (задача 14.18).
 * Идёт до `specializations` и после `orders` (заказы ссылаются на клиентов).
 */
export async function clearAll() {
  await dbAdapter.execute('DELETE FROM clients')
}

export async function applyServerRecord(record) {
  // Ищем локальную запись по server_id (id сервера)
  const existing = await dbAdapter.query(`
    SELECT * FROM clients WHERE server_id = ?
  `, [record.id]); // используем record.id как server_id

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
    // Новая запись
    const localId = uuidv4();
    const params = clientInsertFromServerParams({
      localId, // локальный id
      serverId: record.id,
      localSpecializationId,
      specializationServerId: record.specialization_id,
      name: record.name,
      phone: record.phone || '',
      // Сервер отдаёт ISO-строки, локально храним UNIX-секунды (задача 3.8).
      createdAt: toEpochSeconds(record.created_at),
      updatedAt: toEpochSeconds(record.updated_at),
    });

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  // Обновление существующей записи: побеждает более свежий updated_at (last-write-wins).
  const local = existing[0];
  if (toEpochSeconds(record.updated_at) > toEpochSeconds(local.updated_at, 0)) {
    const updateParams = clientUpdateFromServerParams({
      name: record.name,
      phone: record.phone || '',
      localSpecializationId,
      specializationServerId: record.specialization_id,
      updatedAt: toEpochSeconds(record.updated_at),
      serverId: record.id,
    });
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}
