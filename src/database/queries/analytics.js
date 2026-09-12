// src/database/queries/analytics.js
//
// SQL аналитики (задача 9.1). Считает **локальная** БД, потому что приложение
// офлайн-первое: страница аналитики должна работать без сети. Методика ровно та же,
// что у серверного `StatisticRepository::billedOrdersSubquery()` (и та же, что в
// `src/utils/analytics.js`), — иначе «цифры на странице» не сойдутся с отчётами:
//
//   • учтённый заказ — `status = 'done'`, `paid`, `deleted_at IS NULL`;
//   • выручка = работы + товары + ручные материалы;
//   • себестоимость (задачи 9.5/9.6) = закупка товаров со склада + закупка ручных
//     позиций; у работ себестоимости нет (это труд мастера);
//   • маржа = выручка − себестоимость;
//   • период — по `orders.updated_at` (локальные секунды).
//
// Суммы позиций собираются подзапросами, а не цепочкой JOIN-ов: иначе строки работ,
// товаров и материалов перемножились бы между собой и выручка «раздулась».
export default {
  /** Заказы мастерской + выручка и себестоимость по каждой позиции отдельными колонками. */
  ordersWithRevenue: `
    SELECT
      orders.id,
      orders.status,
      orders.paid,
      orders.total_amount,
      orders.updated_at,
      COALESCE(services_lines.total, 0)  AS services_total,
      COALESCE(products_lines.total, 0)  AS products_total,
      COALESCE(materials_lines.total, 0) AS materials_total,
      COALESCE(products_lines.cost, 0)   AS products_cost,
      COALESCE(materials_lines.cost, 0)  AS materials_cost
    FROM orders
    LEFT JOIN (
      SELECT order_id, SUM(quantity * sale_price) AS total
      FROM order_service
      WHERE deleted_at IS NULL
      GROUP BY order_id
    ) AS services_lines ON services_lines.order_id = orders.id
    LEFT JOIN (
      SELECT
        order_id,
        SUM(quantity * sale_price) AS total,
        SUM(quantity * COALESCE(buy_price, 0)) AS cost
      FROM order_product
      WHERE deleted_at IS NULL
      GROUP BY order_id
    ) AS products_lines ON products_lines.order_id = orders.id
    LEFT JOIN (
      SELECT
        order_id,
        SUM(amount * price) AS total,
        SUM(amount * COALESCE(buy_price, 0)) AS cost
      FROM materials
      WHERE deleted_at IS NULL
      GROUP BY order_id
    ) AS materials_lines ON materials_lines.order_id = orders.id
    WHERE orders.specialization_id = ?
      AND orders.deleted_at IS NULL
  `,

  /** Топ работ за период: количество в позициях и выручка по цене позиции. */
  topServices: `
    SELECT
      services.service                                        AS name,
      SUM(order_service.quantity)                             AS quantity,
      SUM(order_service.quantity * order_service.sale_price)  AS total
    FROM order_service
    JOIN services ON services.id = order_service.service_id
    JOIN orders ON orders.id = order_service.order_id
    WHERE orders.specialization_id = ?
      AND orders.deleted_at IS NULL
      AND orders.status = 'done'
      AND orders.paid = 1
      AND orders.updated_at BETWEEN ? AND ?
      AND order_service.deleted_at IS NULL
    GROUP BY order_service.service_id, services.service
    ORDER BY total DESC, quantity DESC
    LIMIT ?
  `,

  /**
   * Топ товаров со склада за период (товар мог быть удалён — строка всё равно считается).
   * `margin` — маржа по строкам (задачи 9.5/9.6): цена минус закупка на момент продажи.
   */
  topProducts: `
    SELECT
      COALESCE(products.name, '—')                            AS name,
      SUM(order_product.quantity)                             AS quantity,
      SUM(order_product.quantity * order_product.sale_price)  AS total,
      SUM(order_product.quantity
          * (order_product.sale_price - COALESCE(order_product.buy_price, 0))) AS margin
    FROM order_product
    JOIN orders ON orders.id = order_product.order_id
    LEFT JOIN products ON products.id = order_product.product_id
    WHERE orders.specialization_id = ?
      AND orders.deleted_at IS NULL
      AND orders.status = 'done'
      AND orders.paid = 1
      AND orders.updated_at BETWEEN ? AND ?
      AND order_product.deleted_at IS NULL
    GROUP BY order_product.product_id, products.name
    ORDER BY total DESC, quantity DESC
    LIMIT ?
  `,

  /** Топ ручных позиций («купил на стороне») — таблица `materials` хранит имя строкой. */
  topMaterials: `
    SELECT
      materials.name                         AS name,
      SUM(materials.amount)                  AS quantity,
      SUM(materials.amount * materials.price) AS total,
      SUM(materials.amount * (materials.price - COALESCE(materials.buy_price, 0))) AS margin
    FROM materials
    JOIN orders ON orders.id = materials.order_id
    WHERE orders.specialization_id = ?
      AND orders.deleted_at IS NULL
      AND orders.status = 'done'
      AND orders.paid = 1
      AND orders.updated_at BETWEEN ? AND ?
      AND materials.deleted_at IS NULL
    GROUP BY materials.name
    ORDER BY total DESC, quantity DESC
    LIMIT ?
  `,
}
