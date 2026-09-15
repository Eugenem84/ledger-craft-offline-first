import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/specializations' // <-- Убедись, что этот файл существует
import operationsRepo from 'src/repositories/operationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  specializationInsertParams,
  specializationUpdateParams,
  specializationInsertFromServerParams,
  specializationUpdateFromServerParams,
  featuresToStorage,
} from 'src/database/mappers/specializations.js'

/**
 * Получает все специализации из локальной базы данных.
 * @returns {Promise<Array>}
 */
export async function getAll() {
  return await dbAdapter.query(queries.getAll)
}

export async function getById(id) {
  const result = await dbAdapter.query(queries.getById, [id]);
  return result.length > 0 ? result[0] : null;
}

export async function findByServerId(serverId) {
  const result = await dbAdapter.query(queries.findByServerId, [serverId]);
  return result.length > 0 ? result[0] : null;
}

/**
 * Обе формы ключа рабочего профиля для фильтров каталога и склада (дефект 15.09.2026).
 *
 * В таблицах, где FK специализации хранится **одной** колонкой (`categories`,
 * `product_categories` — парной `specialization_server_id` у них нет), до синка лежит
 * локальный UUID, а после — **серверный id**: `applyServerRecord` пишет
 * `record.specialization_id` «как есть». Строгое равенство по локальному UUID после
 * первого синка «опустошало» такой раздел — так вкладка «движение товаров» на складе
 * была пустой только на Android (там категории товаров приехали синком), а в браузере
 * (категории созданы локально) показывалась. Поэтому фильтр обязан проверять **обе**
 * формы: сначала получаем пару ключей здесь, дальше SQL идёт по
 * `specialization_id = ? OR specialization_id = ?`.
 *
 * Владельцы правила: `categoriesRepo`, `productCategoriesRepo`, `stockHistoryRepo`.
 *
 * @param {string} specializationId локальный UUID специализации
 * @returns {Promise<{localId: string|null, serverId: number|null}>}
 */
export async function resolveScopeKeys(specializationId) {
  if (!specializationId) return { localId: null, serverId: null };

  const spec = await dbAdapter.queryOne(
    'SELECT id, server_id FROM specializations WHERE id = ?',
    [specializationId]
  );

  // Записи может не быть (легаси/чужой id) — тогда работаем по тому, что передали.
  return { localId: spec?.id ?? specializationId, serverId: spec?.server_id ?? null };
}

/**
 * Сохраняет новую специализацию в локальной базе и добавляет операцию в очередь.
 *
 * ⚠️ До 5.3 репозиторий клал операцию через `dbAdapter.enqueueOperation()` —
 * это заглушка адаптера (ничего не делает), поэтому у специальности никогда не
 * появлялся `server_id`, а все записи с `specialization_id` (клиенты, категории,
 * товарные категории, модели техники, заказы) висели в очереди навсегда.
 * Теперь операция ставится так же, как у остальных репозиториев — через
 * `operationsRepo.enqueue`, а локальный id лежит в payload под `local_id`.
 *
 * @param {object} specialization - Объект специализации. Должен содержать 'name'.
 * @returns {Promise<string>} - Локальный UUID созданной записи.
 */
export async function save(specialization) {
  const id = specialization.id || uuidv4()

  // Фаза 10 (10.6): поля профиля (`preset_key`, `accent`, `features`, `archived`,
  // `template_version`) — в порядке колонок маппера, как и остальные репозитории
  // после задачи 8.3.
  const params = specializationInsertParams({ id, specialization })

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...specialization };
  delete payloadForServer.id;
  // `features` — флаги вкладок: в БД и на сервере это TEXT/JSON, поэтому объект
  // сериализуем и в payload очереди (иначе Postgres-колонка получит массив/объект).
  if (payloadForServer.features !== undefined) {
    payloadForServer.features = featuresToStorage(payloadForServer.features);
  }
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'specializations', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);
  return id
}

/**
 * Обновляет существующую специализацию в локальной базе и добавляет операцию в очередь.
 *
 * @param {object} specialization - Объект специализации. Должен содержать 'id'.
 *
 * ⚠️ До Фазы 10 стор звал этот метод как `update(id, changes)` (двумя аргументами),
 * а репозиторий — как `update(specialization)` (одним). Переименование/архивирование
 * профиля (задача 10.8) и смена пресета (10.4) впервые пошли по этому пути, поэтому
 * сигнатуры приведены к одному виду: стор собирает объект `{ id, ...changes }`.
 */
export async function update(specialization) {
  const existing = await dbAdapter.queryOne(queries.getById, [specialization.id])
  if (!existing) return

  // ⚠️ Дефект, найденный тестом Фазы 12 (12.1): стор зовёт `update` частичным
  // набором полей (`{ id, preset_key, ... }`, `{ id, archived }`), а `queries.update`
  // перезаписывает ВСЕ колонки — `name` из частичного объекта попадал в биндинг
  // как `undefined`, и sql.js падал («tried to bind … unknown type»). Поэтому
  // сначала сливаем изменение с текущей строкой БД.
  const merged = { ...existing, ...specialization }
  const params = specializationUpdateParams(merged)
  await dbAdapter.execute(queries.update, params)

  if (existing && existing.server_id) {
    const payloadForServer = {
      id: existing.server_id,
      name: merged.name,
      preset_key: merged.preset_key ?? null,
      accent: merged.accent ?? null,
      features: featuresToStorage(merged.features),
      archived: merged.archived ? 1 : 0,
      template_version: merged.template_version ?? null,
    };
    await operationsRepo.enqueue([
      uuidv4(),
      'update',
      'specializations',
      JSON.stringify(payloadForServer),
      Date.now(),
    ]);
  }
}

/**
 * Удаляет специализацию из локальной базы и добавляет операцию в очередь.
 * @param {string} id - Локальный ID специализации для удаления.
 */
export async function remove(id) {
  const existing = await dbAdapter.queryOne(queries.getById, [id])

  if (existing && existing.server_id) {
    await operationsRepo.enqueue([
      uuidv4(),
      'delete',
      'specializations',
      JSON.stringify({ id: existing.server_id }),
      Date.now(),
    ]);
  } else if (existing) {
    // Запись ещё не уезжала — отменяем незавершённый INSERT.
    await operationsRepo.removeByLocalId('specializations', id);
  }

  await dbAdapter.execute(queries.delete, [id])
}


/**
 * Проставляет серверный id после успешного INSERT (нужно, чтобы «дети» этой
 * специальности — клиенты, категории, товарные категории, модели, заказы —
 * смогли уехать: syncService переводит их локальные FK в server_id).
 */
export async function updateServerId(localId, serverId) {
  await dbAdapter.execute('UPDATE specializations SET server_id = ? WHERE id = ?', [serverId, localId]);
}

/**
 * Полностью очищает таблицу специализаций в локальной базе.
 * Используется для отладки и полного сброса.
 */
export async function clearAll() {
  await dbAdapter.execute(`DELETE FROM specializations`);
}

/**
 * Применяет запись, полученную с сервера, к локальной базе данных.
 * Создает новую запись или обновляет существующую, если серверная версия новее.
 * @param {object} record - Запись специализации с сервера.
 */
export async function applyServerRecord(record) {
  const existing = await dbAdapter.query(queries.findByServerId, [record.id])

  if (!existing.length) {
    // Новая запись с сервера; время приводим к общему стандарту — UNIX-секунды (задача 3.8).
    const localId = uuidv4()

    const params = specializationInsertFromServerParams({
      localId,
      record,
      createdAt: toEpochSeconds(record.created_at),
      updatedAt: toEpochSeconds(record.updated_at),
    })
    await dbAdapter.execute(queries.insertFromServer, params)
    return localId
  } else {
    // Обновление существующей записи: побеждает более свежий updated_at (last-write-wins).
    const local = existing[0]

    if (toEpochSeconds(record.updated_at) > toEpochSeconds(local.updated_at, 0)) {
      const updateParams = specializationUpdateFromServerParams({
        record,
        updatedAt: toEpochSeconds(record.updated_at),
      })
      await dbAdapter.execute(queries.updateFromServer, updateParams)
    }

    return local.id
  }
}
