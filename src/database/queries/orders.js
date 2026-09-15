/**
 * Итог заказа по позициям — **единственный источник правды для суммы в списке**.
 *
 * Разбор 15.09.2026: карточка заказа и «Аналитика» считают сумму из позиций
 * (`цена × количество` по строкам), а список печатал снапшот `orders.total_amount`,
 * который пишется только при сохранении заказа из карточки. Как только строки
 * менялись в обход этого сохранения (приехали с сервера/второго устройства,
 * «Починка очереди», восстановление из бэкапа) или заказ приходил с сервера с пустым
 * `total_amount`, список начинал противоречить карточке. Задача 9.1 уже отказалась от
 * `orders.total_amount` в расчётах (`docs/ARCHITECTURE.md` §9, `docs/PLAN.md` 9.1) —
 * здесь та же методика, что в `queries/analytics.js`: работы `quantity × sale_price`,
 * товары `quantity × sale_price`, ручные позиции `amount × price`, только живые строки.
 */
const POSITIONS_TOTAL_COLUMN = `
      (
        COALESCE(services_lines.total, 0) +
        COALESCE(products_lines.total, 0) +
        COALESCE(materials_lines.total, 0)
      ) AS positions_total`

const POSITIONS_TOTAL_JOINS = `
    LEFT JOIN (
      SELECT order_id, SUM(quantity * sale_price) AS total
      FROM order_service
      WHERE deleted_at IS NULL
      GROUP BY order_id
    ) AS services_lines ON services_lines.order_id = o.id
    LEFT JOIN (
      SELECT order_id, SUM(quantity * sale_price) AS total
      FROM order_product
      WHERE deleted_at IS NULL
      GROUP BY order_id
    ) AS products_lines ON products_lines.order_id = o.id
    LEFT JOIN (
      SELECT order_id, SUM(amount * price) AS total
      FROM materials
      WHERE deleted_at IS NULL
      GROUP BY order_id
    ) AS materials_lines ON materials_lines.order_id = o.id`

export default {
  getAll: `
    SELECT
      o.*,
      c.name AS client_name,
      c.phone AS client_phone,
      ${POSITIONS_TOTAL_COLUMN}
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    ${POSITIONS_TOTAL_JOINS}
  `,
  getById: `
    SELECT
      o.*,
      c.name AS client_name,
      c.phone AS client_phone,
      ${POSITIONS_TOTAL_COLUMN}
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    ${POSITIONS_TOTAL_JOINS}
    WHERE o.id = ?
  `,
  getBySpecializationId: `
    SELECT
      o.*,
      c.name AS client_name,
      c.phone AS client_phone,
      ${POSITIONS_TOTAL_COLUMN}
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    ${POSITIONS_TOTAL_JOINS}
    WHERE o.specialization_id = ?
  `,
  insert: `
    INSERT INTO orders (id, server_id, specialization_id, specialization_server_id, client_id, client_server_id, hours, minutes, total_amount, comments, user_id, user_order_number, status, paid, model_id, model_server_id, share_token, equipment_identifier, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE orders
    SET specialization_id = ?, specialization_server_id = ?, client_id = ?, client_server_id = ?, hours = ?, minutes = ?, total_amount = ?, comments = ?, user_id = ?, user_order_number = ?, status = ?, paid = ?, model_id = ?, model_server_id = ?, share_token = ?, equipment_identifier = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM orders WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO orders (id, server_id, specialization_id, specialization_server_id, client_id, client_server_id, hours, minutes, total_amount, comments, user_id, user_order_number, status, paid, model_id, model_server_id, share_token, equipment_identifier, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE orders
    SET specialization_id = ?, specialization_server_id = ?, client_id = ?, client_server_id = ?, hours = ?, minutes = ?, total_amount = ?, comments = ?, user_id = ?, user_order_number = ?, status = ?, paid = ?, model_id = ?, model_server_id = ?, share_token = ?, equipment_identifier = ?, updated_at = ?
    WHERE server_id = ?
  `,
  updateServerId: `
    UPDATE orders
    SET server_id = ?
    WHERE id = ?
  `
};
