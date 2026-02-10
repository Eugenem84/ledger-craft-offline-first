import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/products'
import operationsRepo from 'src/repositories/operationsRepo'
import { getLocalIdByServerId as getCategoryLocalId } from 'src/repositories/productCategoriesRepo.js'

export async function getAll() {
  const rows = await dbAdapter.query(queries.getAll)
  return rows
}

export async function getByCategoryId(categoryId) {
  const rows = await dbAdapter.query(queries.getByCategoryId, [categoryId]);
  return rows;
}

export async function save(product) {
  const id = product.id || uuidv4()

  const params = [
    id,
    product.server_id || null,
    product.name,
    product.description,
    product.manufacturer,
    product.product_number,
    product.weight,
    product.base_sale_price,
    product.product_category_id
  ]

  await dbAdapter.execute(queries.insert, params)

  const payloadForServer = { ...product };
  delete payloadForServer.id;
  const opId = uuidv4();
  const opPayload = JSON.stringify({ local_id: id, ...payloadForServer });
  const opParams = [opId, 'insert', 'products', opPayload, Date.now()];

  await operationsRepo.enqueue(opParams);

  return id
}

export async function update(product) {
  const existingProduct = await dbAdapter.queryOne(queries.getById, [product.id]);
  // Найдем категорию, чтобы получить ее server_id для отправки в очередь
  const category = await dbAdapter.queryOne('SELECT server_id FROM product_categories WHERE id = ?', [product.product_category_id]);
  const categoryServerId = category ? category.server_id : null;

  const params = [
    product.name,
    product.description,
    product.manufacturer,
    product.product_number,
    product.weight,
    product.base_sale_price,
    product.product_category_id,
    product.id
  ];
  await dbAdapter.execute(queries.update, params);

  if (existingProduct && existingProduct.server_id) {
    const opId = uuidv4();
    const payloadForServer = {
      id: existingProduct.server_id,
      name: product.name,
      description: product.description,
      manufacturer: product.manufacturer,
      product_number: product.product_number,
      weight: product.weight,
      base_sale_price: product.base_sale_price,
      product_category_id: categoryServerId // Отправляем на сервер его ID категории
    };
    const opPayload = JSON.stringify(payloadForServer);
    const opParams = [opId, 'update', 'products', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  }
}

export async function remove(id) {
  const product = await dbAdapter.queryOne(queries.getById, [id]);

  if (product && product.server_id) {
    const opId = uuidv4();
    const opPayload = JSON.stringify({ id: product.server_id });
    const opParams = [opId, 'delete', 'products', opPayload, Date.now()];
    await operationsRepo.enqueue(opParams);
  } else if (product) {
    await operationsRepo.removeByLocalId('products', id);
  }

  await dbAdapter.execute(queries.delete, [id]);
}

export async function applyServerRecord(record) {
  const existing = await dbAdapter.query(`
    SELECT * FROM products WHERE server_id = ?
  `, [record.id]);

  if (!existing.length) {
    // --- ИСПРАВЛЕНИЕ ---
    // Находим локальный ID категории по ее серверному ID
    const localCategoryId = await getCategoryLocalId(record.product_category_id);
    if (!localCategoryId) {
      console.warn(`Не удалось найти локальную категорию для товара "${record.name}" (server_id: ${record.id}). Товар не будет добавлен.`);
      return;
    }
    const params = [
      uuidv4(),
      record.id,
      record.name,
      record.description,
      record.manufacturer,
      record.product_number,
      record.weight,
      record.base_sale_price,
      localCategoryId, // Используем найденный локальный ID
      record.created_at || Math.floor(Date.now() / 1000),
      record.updated_at || Math.floor(Date.now() / 1000)
    ];

    await dbAdapter.execute(queries.insertFromServer, params);
    return;
  }

  const local = existing[0];
  if (record.updated_at > local.updated_at) {
    // --- ИСПРАВЛЕНИЕ (для обновления) ---
    const localCategoryId = await getCategoryLocalId(record.product_category_id);
    if (!localCategoryId) {
      console.warn(`Не удалось найти локальную категорию для обновления товара "${record.name}" (server_id: ${record.id}). Товар не будет обновлен.`);
      return;
    }

    const updateParams = [
      record.name,
      record.description,
      record.manufacturer,
      record.product_number,
      record.weight,
      record.base_sale_price,
      localCategoryId, // Используем найденный локальный ID
      record.updated_at,
      record.id
    ];
    await dbAdapter.execute(queries.updateFromServer, updateParams);
  }
}

export async function clearAll() {
  await dbAdapter.execute('DELETE FROM products');
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId]);
}

// --- DEBUG FUNCTION ---
export async function logAllProductsForDebugging() {
  try {
    const allProducts = await getAll();
    console.log('--- [DEBUG] Содержимое таблицы `products` в локальной БД ---');
    console.table(allProducts);
  } catch (e) {
    console.error('Ошибка при отладке таблицы products:', e);
  }
}
