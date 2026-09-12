// src/database/mappers/orders.js
//
// Задача 8.3: именованные мапперы позиционных аргументов SQL для заказов.
//
// Раньше `ordersRepo` собирал массивы из 16 значений «на глаз» (`params = [id, server_id,
// specializationData.id, …]`), и при правке запроса легко было перепутать порядок —
// ошибка вылезала только рантаймом на реальных данных. Теперь порядок колонок живёт
// **только здесь** (по одному месту на каждый запрос), а репозиторий называет поля.
//
// Договорённость: массивы возвращаются ровно в порядке `?` соответствующего запроса из
// `src/database/queries/orders.js`.
import { toEpochSeconds } from 'src/utils/timestamps.js'

/**
 * Данные заказа (локальная запись или черновик).
 *
 * @typedef {object} OrderAttributes
 * @property {string} [id] локальный UUID
 * @property {number|null} [server_id]
 * @property {string|null} [specialization_id] локальный UUID специализации
 * @property {number|null} [specialization_server_id]
 * @property {string|null} [client_id] локальный UUID клиента
 * @property {number|null} [client_server_id]
 * @property {number} [hours]
 * @property {number} [minutes]
 * @property {number} [total_amount] рубли
 * @property {string} [comments]
 * @property {number|null} [user_id]
 * @property {number|null} [user_order_number]
 * @property {string} [status]
 * @property {number|boolean} [paid]
 * @property {string|null} [model_id] локальный UUID модели техники
 * @property {string|null} [share_token]
 */

/**
 * Внешний ключ, хранящийся в паре «локальный id + серверный id»
 * (результат `ordersRepo.getSpecializationData`/`getClientData`).
 *
 * @typedef {object} ForeignKeyRef
 * @property {string|null} id
 * @property {number|null} server_id
 */

/**
 * `queries.insert` — локальное сохранение заказа.
 *
 * @param {{ id: string, order: OrderAttributes, specialization: ForeignKeyRef, client: ForeignKeyRef }} input
 * @returns {Array<string|number|null>}
 */
export function orderInsertParams({ id, order, specialization, client }) {
  return [
    id,
    order.server_id || null,
    specialization.id,
    specialization.server_id,
    client.id,
    client.server_id,
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
  ]
}

/**
 * `queries.update` — локальное обновление заказа (`WHERE id = ?` — последний параметр).
 *
 * @param {{ order: OrderAttributes, specialization: ForeignKeyRef, client: ForeignKeyRef }} input
 * @returns {Array<string|number|null>}
 */
export function orderUpdateParams({ order, specialization, client }) {
  return [
    specialization.id,
    specialization.server_id,
    client.id,
    client.server_id,
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
    order.id,
  ]
}

/**
 * `queries.insertFromServer` — запись, приехавшая из `/sync-updates`.
 * Время сервер отдаёт строками ISO-8601, локально храним UNIX-секунды (задача 3.8).
 *
 * @param {object} record серверная запись
 * @param {{ localId: string, specialization: ForeignKeyRef, client: ForeignKeyRef, localModelId: string|null }} input
 * @returns {Array<string|number|null>}
 */
export function orderInsertFromServerParams(record, { localId, specialization, client, localModelId }) {
  return [
    localId,
    record.id,
    specialization.id,
    specialization.server_id,
    client.id,
    client.server_id,
    // Необязательные поля записи могут отсутствовать в выгрузке (например, пришла только
    // часть колонок): без `?? null` sql.js падает на биндинге `undefined`, и **вся** таблица
    // `orders` не применяется — заказ «теряется» на втором устройстве. Найдено тестом 9.6.
    record.hours ?? null,
    record.minutes ?? null,
    record.total_amount ?? 0,
    record.comments ?? null,
    record.user_id ?? null,
    record.user_order_number ?? null,
    record.status ?? null,
    record.paid ?? 0,
    localModelId ?? null,
    record.share_token ?? null,
    toEpochSeconds(record.created_at),
    toEpochSeconds(record.updated_at),
  ]
}

/**
 * `queries.updateFromServer` — обновление по `server_id` (последний параметр).
 *
 * @param {object} record серверная запись
 * @param {{ specialization: ForeignKeyRef, client: ForeignKeyRef, localModelId: string|null }} input
 * @returns {Array<string|number|null>}
 */
export function orderUpdateFromServerParams(record, { specialization, client, localModelId }) {
  return [
    specialization.id,
    specialization.server_id,
    client.id,
    client.server_id,
    // `?? null` — как в insert: отсутствующее поле не должно ронять применение записи.
    record.hours ?? null,
    record.minutes ?? null,
    record.total_amount ?? 0,
    record.comments ?? null,
    record.user_id ?? null,
    record.user_order_number ?? null,
    record.status ?? null,
    record.paid ?? 0,
    localModelId ?? null,
    record.share_token ?? null,
    toEpochSeconds(record.updated_at),
    record.id,
  ]
}
