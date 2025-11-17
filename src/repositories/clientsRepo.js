import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/clients'

//console.log('queries.insert:', queries.insert)
console.log('!!! queries object:', queries)

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  console.log('repo rows: ',rows)
  return rows
}

export async function save(client) {
  const id = client.id || uuidv4()
  const params = [
    id,
    client.server_id || null,
    client.specialization_id || null,
    client.name,
    client.phone || ''
  ]

  //console.log('queries.insert:', queries.insert)

  await dbAdapter.execute(queries.insert, params)
  await dbAdapter.enqueueOperation({
    type: 'insert',
    table: 'clients',
    payload: { id, ...client }
  })

  return id
}

export async function update(client) {
  const params = [client.name, client.phone, client.email, client.id]
  await dbAdapter.execute(queries.update, params)
  await dbAdapter.enqueueOperation({
    type: 'update',
    table: 'clients',
    payload: client
  })
}

export async function remove(id) {
  await dbAdapter.execute(queries.delete, [id])
  await dbAdapter.enqueueOperation({
    type: 'delete',
    table: 'clients',
    payload: { id }
  })
}

export async function applyServerRecord(record) {
  // Ищем локальную запись по server_id (id сервера)
  const existing = await dbAdapter.query(`
    SELECT * FROM clients WHERE server_id = ?
  `, [record.id]); // используем record.id как server_id

  if (!existing.length) {
    // Новая запись
    const localId = uuidv4();
    const params = [
      localId,           // локальный id
      record.id,         // server_id
      record.specialization_id || null,
      record.name,
      record.phone || '',
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  // Обновление существующей записи
  const local = existing[0];
  if (record.updated_at > local.updated_at) {
    const updateParams = [
      record.name,
      record.phone || '',
      record.updated_at,
      record.id // server_id для WHERE
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}
