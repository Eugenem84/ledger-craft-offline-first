# Бэкенд: контракт API (по реальному коду Laravel)

> Исходники бэкенда лежат **рядом** с фронтом: `/Users/artem/PhpstormProjects/LedgerCraftDocker03`
> (Laravel + MySQL, `docker-compose.yaml`). Обе папки объединены файлом `.code-workspace`.
> Документ составлен **по реальному коду сервера**: `routes/api.php`,
> `app/Http/Controllers/SyncController.php`, `app/Http/Controllers/ProductController.php`,
> серверные миграции `database/migrations/`.

## 1. Общие сведения

| Параметр | Значение |
|---|---|
| Код сервера | `/Users/artem/PhpstormProjects/LedgerCraftDocker03` (Laravel) |
| Стек | PHP + Laravel (Sanctum для auth) + MySQL |
| Пуск | `docker-compose.yaml` |
| Base URL (dev) | `https://dev.medovf2h.beget.tech/api` |
| Идентификация клиента | заголовок `X-Sync-ID` (UUID из `localStorage` устройства) |
| Формат данных | JSON |
| Клиент | axios (`src/services/api.js`) |

Идентификация по `X-Sync-ID` **не является авторизацией** — это просто метка устройства.
Отдельно есть настоящая авторизация: `POST /api/register`, `POST /api/login` (Sanctum),
`/api/me`, `/api/logout`, `/api/delete-account`.

## 2. Эндпоинты

### 2.1. `POST /api/sync` — отправка локальных изменений

Реализация: `SyncController::sync()`. Тело заворачивается в одну транзакцию БД.

```
POST /api/sync
Headers: Content-Type: application/json
         X-Sync-ID: <uuid устройства>
Body:
{
  "operations": [
    {
      "type": "insert",                    // insert | update | delete
      "table": "orders",                   // имя таблицы (см. $tables ниже)
      "payload": {
        "local_id": "<локальный UUID>",    // клиентский идентификатор операции
        "field": "value",                  // поля записи, FK уже переведены в server_id
        ...
      }
    }
  ]
}
```

Ответ (сервер → клиент):

```json
{
  "synced": [
    { "type": "insert", "local_id": "<из запроса>", "server_id": 12345 }
  ],
  "errors": [
    { "local_id": "<из запроса>", "error": "DATABASE_ERROR", "details": { "message": "..." } }
  ]
}
```

Важные детали (по коду сервера):
- **ответ содержит `server_id`, а не `id`** — клиент по нему обновляет локальную запись;
- сервер берёт `localId = payload.uuid_id ?? payload.local_id ?? op.id`;
- поля `id`, `local_id`, `uuid_id` **вырезаются** из payload перед вставкой в БД;
- неизвестная таблица или битая структура операции → запись в `errors` с `Invalid operation structure or table.`;
- `MISSING_ID_FOR_UPDATE` / `MISSING_ID_FOR_DELETE` — если в payload нет `id` (серверного);
- ошибки БД ловятся (`QueryException`) и возвращаются в `errors` — **вся транзакция при этом не откатывается** (используется Laravel `DB::transaction`, а исключения проглатываются внутри цикла — это серверный риск, см. §5);
- если колонка `last_sync_id` существует, сервер проставляет её значением `X-Sync-ID` (анти-эхо). ⚠️ сейчас такой колонки **нет ни у одной таблицы**, механизм фактически не работает.

**Спец-обработка `orders`** (не все поля!): сервер принимает только
`specialization_id, client_id, hours, minutes, total_amount, comments` — остальное игнорируется.
`total_amount` — **в рублях** (без конверсии).

**Спец-обработка `order_service`**: сервер ждёт `order_id`/`service_id` уже как **серверные**
ID и `sale_price`/`quantity`; если `sale_price` не передан, берётся цена из таблицы `services`.

### `$tables` — какие таблицы принимает синк

`clients, specializations, orders, equipment_models, incoming_products, materials, order_product,
order_service, products, product_categories, product_stocks, categories, services,
service_categories, by_product_prices, sales_product_prices`

⚠️ Расхождения с реальными таблицами БД сервера (ошибки в списке):
- `by_product_prices` → таблица называется **`buy_product_prices`**;
- `sales_product_prices` → таблица называется **`sales_products_prices`**;
- `service_categories` — такой таблицы **нет** (есть `categories` и `product_categories`), лишнее имя.

### 2.2. `GET /api/sync-updates` — инкрементальная выгрузка изменений

Реализация: `SyncController::fetchUpdates()`.

```
GET /api/sync-updates?table=<table>&since=<ms>
Headers: X-Sync-ID: <uuid устройства>
```

- `since` — число **миллисекунд** (`Carbon::createFromTimestampMs`);
- если таблица не входит в `$tables` → `400 { "error": "Invalid or missing table" }`;
- фильтр анти-эха: если у таблицы есть колонка `last_sync_id`, сервер исключает записи с
  `last_sync_id == X-Sync-ID` (⚠️ колонок таких нет — фильтр не действует);
- soft-delete: `whereNull('deleted_at')` применяется только к `clients, products, services, categories`;
- сортировка по `updated_at`.

Ответ:

```json
{ "table": "clients", "count": 2, "records": [ { "id": 1, ... }, ... ] }
```

`id` в записях — **серверные** id (клиент пишет их в `server_id`). Для вставки новой записи
клиенту нужны `created_at`/`updated_at`.

### 2.3. `POST /api/arrival_product` — приход товара на склад

Реализация: `ProductController::arrival()`. Тело:

```json
{
  "product_id": 12,
  "base_sale_price": 500,
  "by_price": 300,
  "arrival_quantity": 10,
  "supplier": "ООО Поставщик"
}
```

Валидация: `product_id` — обязателен, должен существовать в `product_stocks.product_id`.
Сервер выполняет **три действия**:
1. `ProductRepository::arrivalUpdate(productId, baseSalePrice)` — обновляет `products.base_sale_price`;
2. `ProductStockRepository::arrival(productId, arrivalQuantity)` — увеличивает `product_stocks.quantity`;
3. `IncomingProductRepository::newIncome(productId, arrivalQuantity, byPrice, supplier)` — пишет в `incoming_products`.

Возврат: по коду нет явного `return` → Laravel вернёт пустой ответ (200).

⚠️ На фронте есть UI (`ArrivalProductDialogPage.vue`), но он ходит сюда через `boot/axios.js`
с фиктивным `baseURL: https://api.example.com` — фактически не работает (задача 9.2).

### 2.4. Прочие используемые роуты

| Метод | Путь | Контроллер |
|---|---|---|
| GET | `/api/get_product_stocks/{productCategoryId}` | `ProductStockController::getByProductCategory` |
| GET | `/api/get_products/{productCategoryId}` | `ProductController::getByProductCategory` |
| GET | `/api/get_categories/{specializationId}` | `CategoryController::getBySpecialization` |
| GET | `/api/get_product_categories/{specializationId}` | `ProductCategoryController::getBySpecialization` |
| GET | `/api/get_service/{categoryId}` | `ServiceController::getByCategory` |
| GET | `/api/get_materials_by_order/{orderId}` | `MaterialController::getMaterialsByOrder` |
| POST | `/api/order-report/{order}/share-link` | `OrderController::generateShareLink` |
| GET | `/api/orders_by_specialization/{id}` | `OrderController::getBySpecialization` |
| GET | `/api/get_total_DWYM/{specializationId}` и др. `/api/get_top_*` | `StatisticController` |
| GET | `/api/app-quasar-android-version`, `/api/download-apk`, `/api/hcp/chcp.json` | `AppVersionController` |

`share-link` возвращает `{ "url": "..." }`; используется в `OrderDetailsPage.vue:generateAndCopyLink`
(раньше — баг с неимпортированной `api`, исправлено в задаче 0.4).

## 3. Ожидания сервера от клиента (FK по таблицам)

Судя по `fkTransformationMap` в `syncService.js`, клиент переводит локальные FK в
`server_id` перед отправкой так:

| Таблица | FK, конвертируемые в server_id |
|---|---|
| clients | specialization_id → specializations |
| categories | specialization_id → specializations |
| services | category_id → categories |
| product_categories | specialization_id → specializations |
| products | product_category_id → product_categories |
| orders | client_id → clients; specialization_id → specializations; model_id → equipment_models |
| order_service | order_id → orders; service_id → services |
| equipment_models | specialization_id → specializations |

## 4. Расхождения фронт ↔ сервер (найдено сверкой кода)

1. **Имена таблиц в `$tables` (сервер):** `by_product_prices` и `sales_product_prices` не
   совпадают с реальными таблицами `buy_product_prices` / `sales_products_prices` — синк этих
   таблиц упадёт. `service_categories` — лишнее имя (такой таблицы нет).
2. **Идемпотентность:** сервер вставляет записи через `insertGetId` без проверки дублей.
   `uuid_id` используется только у `order_service`. Повторная отправка той же операции
   создаст дубли на сервере (риск для требования 3.5).
3. **Анти-эхо `last_sync_id`:** код есть, но колонок `last_sync_id` нет ни у одной таблицы →
   механизм не работает (сервер может вернуть клиенту его же записи).
4. **Soft-delete:** `tableHasSoftDeletes()` учитывает только `clients, products, services,
   categories`, тогда как фронт ожидает `deleted_at` у многих таблиц (orders, equipment_models…).
5. **Деньги:** все цены — в **рублях** и на клиенте, и на сервере (`total_amount` без
   конверсии). ✅ согласовано (задача 2.3).
6. **`orders` при синке:** сервер берёт только часть колонок
   (`specialization_id, client_id, hours, minutes, total_amount, comments`) — поля
   `status, paid, model_id, share_token` при **insert** из синка теряются.
7. **Транзакция `/sync`:** исключения ловятся внутри цикла и складываются в `errors`, из-за
   чего `DB::transaction` **не откатывает** частично применённые операции.
8. **`order_product` в `$tables`** уже принимается сервером, но фронт его не отправляет и не
   читает (связные таблицы не в синке — задача 3.4).
9. **Серверный агент-лог:** в `SyncController.php` есть блок `#region agent log`, пишущий в
   файл фронтового репозитория (`.cursor/debug-c685cd.log`) — аналог задачи 0.3, но на сервере.

## 5. Серверные задачи (репозиторий `LedgerCraftDocker03`)

- [x] Исправить `$tables` в `SyncController`: `buy_product_prices`, `sales_products_prices`,
      убрать `service_categories` (сделано в рамках задачи 2.6/серверной гигиены).
- [x] Убрать `#region agent log` из `SyncController.php`.
- [ ] Идемпотентность: не создавать дубли при повторной операции (по `uuid_id`/уникальному ключу).
      Начать: проверка существования по `uuid_id` там, где колонка есть.
- [ ] Ввести `last_sync_id` (миграции) либо убрать мёртвый код анти-эха.
- [ ] Расширить `tableHasSoftDeletes` / унифицировать soft-delete.
- [ ] Разделить транзакцию `/sync` так, чтобы ошибки не «съедались» (частичный откат).
- [ ] Синк `orders`: добавить недостающие поля (`status`, `paid`, `model_id`, `share_token`).