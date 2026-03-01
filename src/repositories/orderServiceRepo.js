import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/order_service'

export async function getByOrderId(orderId) {
  const rows = await dbAdapter.query(queries.getByOrderId, [orderId])

  // Простой вывод содержимого таблицы order_service и строк для конкретного ордера
  try {
    const allRows = await dbAdapter.query('SELECT * FROM order_service')
    console.log('--- [DEBUG] Полное содержимое таблицы order_service ---')
    console.table(allRows)
    console.log('--- [DEBUG] Связи order_service для ордера', orderId, '---')
    console.table(rows)
  } catch (e) {
    console.error('--- [DEBUG] Ошибка при чтении order_service ---', e)
  }

  return rows
}

export async function add(orderId, serviceId) {
  await dbAdapter.execute(queries.insert, [orderId, serviceId])
}

export async function remove(orderId, serviceId) {
  await dbAdapter.execute(queries.delete, [orderId, serviceId])
}

export async function removeByOrderId(orderId) {
  await dbAdapter.execute(queries.deleteByOrderId, [orderId])
}

// --- Синхронизация server -> local для связей "ордер–услуга" ---
export async function applyServerRecord(record) {
  // Ищем локальный ордер по server_id, пришедшему в записи
  const localOrder = await dbAdapter.queryOne(
    'SELECT id FROM orders WHERE server_id = ?',
    [record.order_id]
  )
  if (!localOrder) {
    console.warn(
      `[Sync][order_service] Не найден локальный ордер для server_id=${record.order_id}, связь пропущена.`
    )
    return
  }

  // Ищем локальную услугу по server_id
  const localService = await dbAdapter.queryOne(
    'SELECT id FROM services WHERE server_id = ?',
    [record.service_id]
  )
  if (!localService) {
    console.warn(
      `[Sync][order_service] Не найдена локальная услуга для server_id=${record.service_id}, связь пропущена.`
    )
    return
  }

  const existing = await dbAdapter.query(
    'SELECT * FROM order_service WHERE server_id = ?',
    [record.id]
  )

  const localOrderId = localOrder.id
  const localServiceId = localService.id

  const salePrice =
    record.sale_price !== undefined
      ? record.sale_price
      : record.price !== undefined
        ? record.price
        : null

  const quantity =
    record.quantity !== undefined
      ? record.quantity
      : record.amount !== undefined
        ? record.amount
        : null

  const createdAt =
    record.created_at || Math.floor(Date.now() / 1000)
  const updatedAt =
    record.updated_at || Math.floor(Date.now() / 1000)

  if (!existing.length) {
    const params = [
      uuidv4(),
      record.id,
      localOrderId,
      record.order_id,
      localServiceId,
      record.service_id,
      salePrice,
      quantity,
      createdAt,
      updatedAt,
      record.deleted_at || null
    ]

    await dbAdapter.execute(
      `
      INSERT INTO order_service (
        id,
        server_id,
        order_id,
        order_server_id,
        service_id,
        service_server_id,
        sale_price,
        quantity,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      params
    )
    return
  }

  const updateParams = [
    localOrderId,
    record.order_id,
    localServiceId,
    record.service_id,
    salePrice,
    quantity,
    updatedAt,
    record.deleted_at || null,
    record.id
  ]

  await dbAdapter.execute(
    `
    UPDATE order_service
    SET
      order_id = ?,
      order_server_id = ?,
      service_id = ?,
      service_server_id = ?,
      sale_price = ?,
      quantity = ?,
      updated_at = ?,
      deleted_at = ?
    WHERE server_id = ?
  `,
    updateParams
  )
}

export async function clearAll() {
  await dbAdapter.execute('DELETE FROM order_service')
}
