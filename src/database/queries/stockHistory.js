// src/database/queries/stockHistory.js
//
// История склада (правка владельца 15.09.2026: «в разделе склад нужна история приходов
// и расходов товаров», «список всех товаров … две вкладки: товары и история перемещений»).
// Оба источника — существующие локальные таблицы, поэтому новых миграций и синка не нужно:
//
//   • **приход** — `incoming_products` (рубрика «Поступление», задача 9.2):
//     сколько пришло, по какой закупочной цене и от кого;
//   • **расход** — `order_product` (товар ушёл в заказ) вместе с `orders`:
//     сколько списали и по какой цене продали.
//
// Два набора запросов:
//   • `arrivals`/`expenses` — движения одного товара (карточка товара);
//   • `allArrivals`/`allExpenses` — движения всех товаров **профиля** (вкладка
//     «история перемещений» на складе). Профиль определяется по категории товара —
//     та же привязка, по которой склад строит список товаров.
//
// Строки заказа могут быть мягко удалены (`deleted_at`) — такие движения в историю
// не попадают: возврат строки заказа снимает и расход.
//
// `server_id` прихода отдаём в UI не просто так: количество прихода, который уже уехал
// на сервер, править нельзя — сервер посчитал по нему остаток и не пересчитывает его
// (`IncomingProductRepository::recordArrival()`), и правка тихо разошлась бы со складом.
// Закупку и поставщика сервер принимает обычным `update` — они остаток не меняют.

/** Колонки прихода: одинаковый набор для «одного товара» и «всех товаров профиля». */
const ARRIVAL_COLUMNS = `
      incoming_products.id,
      incoming_products.product_id,
      incoming_products.quantity,
      incoming_products.by_price,
      incoming_products.supplier,
      incoming_products.created_at,
      incoming_products.server_id,
      products.name AS product_name`

/** Колонки расхода (строка заказа + имя товара). */
const EXPENSE_COLUMNS = `
      order_product.id,
      order_product.quantity,
      order_product.sale_price,
      order_product.created_at,
      orders.id AS order_id,
      orders.user_order_number,
      products.name AS product_name`

export default {
  /** Приходы товара: новые сверху. */
  arrivals: `
    SELECT ${ARRIVAL_COLUMNS}
    FROM incoming_products
    LEFT JOIN products ON products.id = incoming_products.product_id
    WHERE incoming_products.product_id = ?
    ORDER BY incoming_products.created_at DESC, incoming_products.id DESC
  `,

  /** Расходы товара (продажи по ордерам): новые сверху. */
  expenses: `
    SELECT ${EXPENSE_COLUMNS}
    FROM order_product
    JOIN orders ON orders.id = order_product.order_id
    LEFT JOIN products ON products.id = order_product.product_id
    WHERE order_product.product_id = ?
      AND order_product.deleted_at IS NULL
      AND orders.deleted_at IS NULL
    ORDER BY order_product.created_at DESC, order_product.id DESC
  `,

  /** Все приходы профиля (вкладка «история перемещений»). */
  allArrivals: `
    SELECT ${ARRIVAL_COLUMNS}
    FROM incoming_products
    JOIN products ON products.id = incoming_products.product_id
    JOIN product_categories ON product_categories.id = products.product_category_id
    WHERE product_categories.specialization_id = ?
    ORDER BY incoming_products.created_at DESC, incoming_products.id DESC
    LIMIT ?
  `,

  /** Все расходы профиля (вкладка «история перемещений»). */
  allExpenses: `
    SELECT ${EXPENSE_COLUMNS}
    FROM order_product
    JOIN orders ON orders.id = order_product.order_id
    JOIN products ON products.id = order_product.product_id
    JOIN product_categories ON product_categories.id = products.product_category_id
    WHERE product_categories.specialization_id = ?
      AND order_product.deleted_at IS NULL
      AND orders.deleted_at IS NULL
    ORDER BY order_product.created_at DESC, order_product.id DESC
    LIMIT ?
  `,
}

