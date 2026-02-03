import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/specializations' // <-- Убедись, что этот файл существует

/**
 * Получает все специализации из локальной базы данных.
 * @returns {Promise<Array>}
 */
export async function getAll() {
  return await dbAdapter.query(queries.getAll)
}

/**
 * Сохраняет новую специализацию в локальной базе и добавляет операцию в очередь.
 * @param {object} specialization - Объект специализации. Должен содержать 'name'.
 * @returns {Promise<string>} - Локальный UUID созданной записи.
 */
export async function save(specialization) {
  const id = specialization.id || uuidv4()

  const params = [
    id,
    specialization.server_id || null,
    specialization.name
  ]

  await dbAdapter.execute(queries.insert, params)

  await dbAdapter.enqueueOperation({
    type: 'insert',
    table: 'specializations',
    payload: { id, ...specialization }
  })

  return id
}

/**
 * Обновляет существующую специализацию в локальной базе и добавляет операцию в очередь.
 * @param {object} specialization - Объект специализации. Должен содержать 'id' и 'name'.
 */
export async function update(specialization) {
  const params = [specialization.name, specialization.id]
  await dbAdapter.execute(queries.update, params)

  await dbAdapter.enqueueOperation({
    type: 'update',
    table: 'specializations',
    payload: specialization
  })
}

/**
 * Удаляет специализацию из локальной базы и добавляет операцию в очередь.
 * @param {string} id - Локальный ID специализации для удаления.
 */
export async function remove(id) {
  await dbAdapter.execute(queries.delete, [id])

  await dbAdapter.enqueueOperation({
    type: 'delete',
    table: 'specializations',
    payload: { id }
  })
}

/**
 * Применяет запись, полученную с сервера, к локальной базе данных.
 * Создает новую запись или обновляет существующую, если серверная версия новее.
 * @param {object} record - Запись специализации с сервера.
 */
export async function applyServerRecord(record) {
  const existing = await dbAdapter.query(queries.findByServerId, [record.id])

  if (!existing.length) {
    // Новая запись с сервера
    const localId = uuidv4()
    const params = [
      localId,
      record.id, // server_id
      record.name,
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ]
    await dbAdapter.execute(queries.insertFromServer, params)
  } else {
    // Обновление существующей записи
    const local = existing[0]
    if (new Date(record.updated_at) > new Date(local.updated_at)) {
      const updateParams = [record.name, record.updated_at, record.id] // WHERE server_id = ?
      await dbAdapter.execute(queries.updateFromServer, updateParams)
    }
  }
}
