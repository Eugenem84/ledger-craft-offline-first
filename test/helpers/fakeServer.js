// test/helpers/fakeServer.js
//
// Фейковый сервер синка (задача 5.2): повторяет контракт `SyncController`
// настолько, насколько он нужен клиенту, и не ходит в сеть.
//
//   • `send({ operations })` → `{ synced, errors }`;
//     каждая операция получает **явный** ответ (`server_id`, `updated_at`) либо
//     ошибку — как настоящий сервер (задача 3.5);
//   • повторный INSERT по тому же `local_id` не дублирует строку (3.5);
//   • `order_service` (нет своего PK) дедуплицируется по натуральному ключу
//     `order_id + service_id` и отдаёт `server_id: null` (3.5);
//   • `fetchUpdates({ table, since })` → `{ table, count, records }`, удаления
//     отдаются tombstone'ом `deleted: true` (3.9).
//
// Сервер не переупорядочивает операции: `applied` хранит порядок приёмки —
// так тесты синка проверяют топологическую сортировку клиента (задача 5.4).

/** Служебные поля клиента сервер не пишет в колонки (аналог stripClientFields). */
function stripClientFields(payload) {
  const clean = {}

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (['id', 'local_id', 'uuid_id', 'server_id'].includes(key)) continue
    if (key.endsWith('_server_id')) continue
    clean[key] = value
  }

  return clean
}

export function createFakeServer() {
  /** @type {Map<string, Map<string, object>>} table → (key → row) */
  const tables = new Map()
  /** Порядок приёма операций: `{ table, type, localId }` */
  const applied = []
  /** Сырые payload'ы, как их прислал клиент (для проверок маппинга полей). */
  const received = []

  let nextId = 1

  const config = {
    /** Error | null — следующий `send()` бросит его (имитация обрыва сети). */
    failSendWith: null,
    /** Error | null — `fetchUpdates()` бросает его, пока не сбросят (обрыв сети целиком). */
    failFetchWith: null,
    /** (op) => boolean — не отдавать ответ по операции (200 OK без результата). */
    noResultFor: null,
    /** (op) => string|null — вернуть ошибку вместо применения операции. */
    errorFor: null,
    /** Фильтровать выдачу по `since` (мс). По умолчанию отдаём всё. */
    filterSince: false,
  }

  function rows(table) {
    if (!tables.has(table)) tables.set(table, new Map())
    return tables.get(table)
  }

  function keyOf(row) {
    if (row.id != null) return String(row.id)
    if (row.uuid_id != null) return `uuid:${row.uuid_id}`
    return `line:${row.order_id}:${row.service_id}`
  }

  function find(table, serverId) {
    return rows(table).get(String(serverId)) ?? null
  }

  function findByUuid(table, uuid) {
    for (const row of rows(table).values()) {
      if (row.uuid_id === uuid) return row
    }
    return null
  }

  function findByNaturalKey(op) {
    for (const row of rows(op.table).values()) {
      if (row.order_id === op.payload.order_id && row.service_id === op.payload.service_id) return row
    }
    return null
  }

  function insert(op) {
    const { table, payload } = op
    const localId = payload.local_id ?? payload.uuid_id ?? null
    const updatedAt = new Date().toISOString()

    const existing =
      (localId != null ? findByUuid(table, localId) : null) ??
      (table === 'order_service' ? findByNaturalKey(op) : null)

    if (existing) {
      // Повторная отправка того же INSERT — обновляем, не дублируем (3.5).
      Object.assign(existing, stripClientFields(payload), { updated_at: updatedAt, deleted_at: null })
      return { serverId: table === 'order_service' ? null : existing.id, updatedAt }
    }

    const serverId = table === 'order_service' ? null : nextId++
    const row = {
      id: serverId,
      uuid_id: localId,
      ...stripClientFields(payload),
      created_at: updatedAt,
      updated_at: updatedAt,
      deleted_at: null,
    }

    rows(table).set(keyOf(row), row)

    return { serverId, updatedAt }
  }

  function update(op) {
    const row = op.payload.id != null ? find(op.table, op.payload.id) : null
    if (!row) return { error: 'RECORD_NOT_FOUND' }

    const updatedAt = new Date().toISOString()
    Object.assign(row, stripClientFields(op.payload), { updated_at: updatedAt, deleted_at: null })

    return { serverId: row.id, updatedAt }
  }

  function remove(op) {
    const row =
      op.table === 'order_service'
        ? findByNaturalKey(op)
        : op.payload.id != null
          ? find(op.table, op.payload.id)
          : null

    // Повторное удаление — не ошибка (идемпотентность, 3.5). Отвечаем всё равно.
    const updatedAt = new Date().toISOString()
    if (row) row.deleted_at = updatedAt

    return { serverId: row?.id ?? null, updatedAt }
  }

  return {
    applied,
    received,

    configure(patch) {
      Object.assign(config, patch)
      return this
    },

    /** Кладёт строку прямо на «сервер» (данные, созданные другим устройством). */
    seed(table, row) {
      // `id: null` — валидный случай (`order_service` без PK), поэтому отличие
      // «id не задан» от «id = null» важно: hasOwnProperty, а не `??`.
      const serverId = Object.prototype.hasOwnProperty.call(row, 'id') ? row.id : nextId++
      const now = row.updated_at ?? new Date().toISOString()
      const stored = {
        ...row,
        id: serverId,
        uuid_id: row.uuid_id ?? null,
        created_at: row.created_at ?? now,
        updated_at: now,
        deleted_at: row.deleted_at ?? null,
      }
      rows(table).set(keyOf(stored), stored)
      return stored
    },

    list(table) {
      return Array.from(rows(table).values())
    },

    /** Имитирует POST /api/sync. */
    async send({ operations }) {
      if (config.failSendWith) {
        const error = config.failSendWith
        config.failSendWith = null
        throw error
      }

      const synced = []
      const errors = []

      for (const op of operations) {
        const localId = op.payload?.local_id ?? op.payload?.uuid_id ?? op.id

        applied.push({ table: op.table, type: op.type, localId })
        received.push({ table: op.table, type: op.type, payload: { ...op.payload } })

        const forcedError = config.errorFor?.(op)
        if (forcedError) {
          errors.push({ local_id: localId, error: forcedError })
          continue
        }

        // «200 OK, но про операцию ничего не сказали» — клиент должен вернуть её в pending.
        if (config.noResultFor?.(op)) continue

        const result =
          op.type === 'insert' ? insert(op) : op.type === 'update' ? update(op) : remove(op)

        if (result.error) {
          errors.push({ local_id: localId, error: result.error })
          continue
        }

        synced.push({
          type: op.type,
          local_id: localId,
          server_id: result.serverId ?? null,
          updated_at: result.updatedAt,
        })
      }

      return { synced, errors }
    },

    /** Имитирует GET /api/sync-updates. */
    async fetchUpdates({ table, since = 0 }) {
      // Обрыв сети целиком: ответа нет ни на отправку, ни на выдачу (пока не сбросят).
      if (config.failFetchWith) throw config.failFetchWith

      const records = Array.from(rows(table).values())
        .filter(row => {
          if (!config.filterSince) return true
          return new Date(row.updated_at).getTime() > since
        })
        .map(row => ({
          ...row,
          deleted: row.deleted_at != null,
          deleted_at: row.deleted_at ?? null,
        }))
        // Как `api.js` на границе сервера: `specializationName` → `name`.
        // Приложение (и тесты) получает то же, что и в реальной выдаче.
        .map(record => {
          if (table === 'specializations' && record.specializationName) {
            record.name = record.specializationName
          }
          return record
        })

      return { table, count: records.length, records }
    },
  }
}
