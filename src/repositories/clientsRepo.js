import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/clients'
import operationsRepo from 'src/repositories/operationsRepo'

//console.log('queries.insert:', queries.insert)
console.log('!!! queries object:', queries)

export async function getAll() {
  const rows =  await dbAdapter.query(queries.getAll)
  console.log('repo rows: ',rows)
  return rows
}

export async function save(client) {
  // Генерируем новый локальный UUID для клиента, если он создается впервые.
  // Если клиент уже имеет id (например, при редактировании), используется существующий.
  const id = client.id || uuidv4()

  // Готовим параметры для SQL-запроса на вставку.
  // Важно сохранять порядок полей, как в самом запросе.
  const params = [
    id,
    client.server_id || null,
    client.specialization_id || null,
    client.name,
    client.phone || ''
  ]

  // Выполняем SQL-запрос для сохранения клиента в локальной базе данных.
  await dbAdapter.execute(queries.insert, params)

  // Добавляем операцию 'insert' в очередь для последующей отправки на сервер.
  // В payload для сервера не должно быть локального id.
  // Но нам нужно знать этот id, чтобы потом обновить запись, когда сервер вернет server_id.
  // Поэтому мы сохраняем его в payload под ключом `local_id`,
  // который будет удален перед отправкой на сервер.
  const payloadForServer = { ...client };
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'clients', opPayload, Date.now()];

  // Вызываем метод репозитория операций для добавления в очередь
  await operationsRepo.enqueue(opParams);

  // --- Добавлено для отладки ---
  const allClients = await dbAdapter.query('SELECT * FROM clients');
  console.log('--- Clients in DB After Save ---');
  console.table(allClients);
  console.log('--------------------------------');

  const queue = await dbAdapter.query('SELECT * FROM operations ORDER BY created_at ASC');
  console.log('--- Operations Queue After Save ---');
  console.table(queue);
  console.log('---------------------------------');
  // --- Конец отладочного кода ---

  // Возвращаем локальный ID созданного или обновленного клиента.
  return id
}

export async function update(client) {
  // Параметры должны соответствовать запросу в `database/queries/clients.js`
  const params = [
    client.server_id || null,
    client.specialization_id || null,
    client.name,
    client.phone || '',
    client.id // для `WHERE id = ?`
  ];
  await dbAdapter.execute(queries.update, params);

  const opId = uuidv4();
  const opPayload = JSON.stringify(client); // В payload для update отправляем измененный объект
  const opParams = [opId, 'update', 'clients', opPayload, Date.now()];
  await operationsRepo.enqueue(opParams);
}

export async function remove(id) {
  await dbAdapter.execute(queries.delete, [id]);

  const opId = uuidv4();
  // Для удаления достаточно передать id в payload
  const opPayload = JSON.stringify({ id });
  const opParams = [opId, 'delete', 'clients', opPayload, Date.now()];
  await operationsRepo.enqueue(opParams);
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
