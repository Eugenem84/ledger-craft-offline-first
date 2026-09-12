// src/database/mappers/catalog.js
//
// Задача 8.3: именованные мапперы позиционных аргументов SQL для справочников,
// которые страница заказа создаёт «на лету»: клиенты, работы (услуги), модели техники.
//
// Порядок колонок сверяется с `src/database/queries/{clients,services,models}.js`.

/**
 * `queries.clients.insert`.
 *
 * @param {{ id: string, client: object }} input
 * @returns {Array<string|number|null>}
 */
export function clientInsertParams({ id, client }) {
  return [
    id,
    client.server_id || null,
    client.specialization_id || null,
    client.specialization_server_id || null,
    client.name,
    client.phone || '',
  ]
}

/**
 * `queries.clients.update` (`WHERE id = ?` — последний параметр).
 *
 * @param {{ id: string, client: object }} input
 * @returns {Array<string|number|null>}
 */
export function clientUpdateParams({ id, client }) {
  return [
    client.name,
    client.phone || '',
    client.specialization_id || null,
    client.specialization_server_id || null,
    id,
  ]
}

/**
 * `queries.clients.insertFromServer`.
 *
 * @param {{ localId: string, serverId: number, localSpecializationId: string|null, specializationServerId: number|null, name: string, phone: string, createdAt: number, updatedAt: number }} input
 * @returns {Array<string|number|null>}
 */
export function clientInsertFromServerParams({
  localId,
  serverId,
  localSpecializationId,
  specializationServerId,
  name,
  phone,
  createdAt,
  updatedAt,
}) {
  return [localId, serverId, localSpecializationId, specializationServerId, name, phone, createdAt, updatedAt]
}

/**
 * `queries.clients.updateFromServer` (`WHERE server_id = ?` — последний параметр).
 *
 * @param {{ name: string, phone: string, localSpecializationId: string|null, specializationServerId: number|null, updatedAt: number, serverId: number }} input
 * @returns {Array<string|number|null>}
 */
export function clientUpdateFromServerParams({
  name,
  phone,
  localSpecializationId,
  specializationServerId,
  updatedAt,
  serverId,
}) {
  return [name, phone, localSpecializationId, specializationServerId, updatedAt, serverId]
}

/**
 * `queries.services.insert`.
 *
 * @param {{ id: string, service: object }} input
 * @returns {Array<string|number|null>}
 */
export function serviceInsertParams({ id, service }) {
  return [
    id,
    service.server_id || null,
    // ⚠️ `|| null`, а не просто `service.category_id`: если категории нет,
    // sql.js падает на биндинге `undefined` («tried to bind a value of an unknown
    // type») — непонятной ошибкой. С null сработает понятное ограничение схемы
    // (`services.category_id NOT NULL`), а тест 5.3 фиксирует это поведение.
    service.category_id || null,
    service.service,
    service.price || '',
  ]
}

/**
 * `queries.services.update` (`WHERE id = ?` — последний параметр).
 *
 * @param {object} service
 * @returns {Array<string|number>}
 */
export function serviceUpdateParams(service) {
  return [service.service, service.price || '', service.id]
}

/**
 * `queries.services.insertFromServer`.
 *
 * @param {{ localId: string, serverId: number, localCategoryId: string, service: string, price: number|string, createdAt: number, updatedAt: number }} input
 * @returns {Array<string|number|null>}
 */
export function serviceInsertFromServerParams({
  localId,
  serverId,
  localCategoryId,
  service,
  price,
  createdAt,
  updatedAt,
}) {
  return [localId, serverId, localCategoryId, service, price || '', createdAt, updatedAt]
}

/**
 * `queries.services.updateFromServer` (`WHERE server_id = ?` — последний параметр).
 *
 * @param {{ localCategoryId: string, service: string, price: number|string, updatedAt: number, serverId: number }} input
 * @returns {Array<string|number|null>}
 */
export function serviceUpdateFromServerParams({
  localCategoryId,
  service,
  price,
  updatedAt,
  serverId,
}) {
  return [service, price || '', updatedAt, localCategoryId, serverId]
}

/**
 * `queries.models.insert` (таблица `equipment_models`).
 *
 * @param {{ id: string, model: object }} input
 * @returns {Array<string|number|null>}
 */
export function modelInsertParams({ id, model }) {
  return [
    id,
    model.server_id || null,
    model.name,
    model.specialization_id || null,
    model.specialization_server_id || null,
    // Пометка «пришло из пресета» (Фаза 10, задача 10.4).
    model.template_key || null,
  ]
}

/**
 * `queries.models.update` (`WHERE id = ?` — последний параметр).
 *
 * @param {object} model
 * @returns {Array<string|number|null>}
 */
export function modelUpdateParams(model) {
  return [
    model.name,
    model.specialization_id || null,
    model.specialization_server_id || null,
    model.template_key || null,
    model.id,
  ]
}

/**
 * `queries.models.insertFromServer`.
 *
 * @param {{ localId: string, serverId: number, name: string, localSpecializationId: string|null, specializationServerId: number|null, templateKey?: string|null, createdAt: number, updatedAt: number }} input
 * @returns {Array<string|number|null>}
 */
export function modelInsertFromServerParams({
  localId,
  serverId,
  name,
  localSpecializationId,
  specializationServerId,
  templateKey,
  createdAt,
  updatedAt,
}) {
  return [
    localId,
    serverId,
    name,
    localSpecializationId,
    specializationServerId,
    templateKey ?? null,
    createdAt,
    updatedAt,
  ]
}

/**
 * `queries.models.updateFromServer` (`WHERE server_id = ?` — последний параметр).
 *
 * @param {{ name: string, localSpecializationId: string|null, specializationServerId: number|null, templateKey?: string|null, updatedAt: number, serverId: number }} input
 * @returns {Array<string|number|null>}
 */
export function modelUpdateFromServerParams({
  name,
  localSpecializationId,
  specializationServerId,
  templateKey,
  updatedAt,
  serverId,
}) {
  return [name, localSpecializationId, specializationServerId, templateKey ?? null, updatedAt, serverId]
}
