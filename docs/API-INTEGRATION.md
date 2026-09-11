# Интеграция клиента с API

> Это **взгляд со стороны клиента**: какие эндпоинты вызывает фронт, что он ожидает от
> ответов и какие есть особенности/ограничения.
> **Канонический контракт API живёт в репозитории бэкенда:**
> `LedgerCraftDocker03/docs/API.md` (серверная схема — `LedgerCraftDocker03/docs/DB.md`).
> При расхождении истина — там.
>
> Код бэкенда (Laravel) лежит рядом: `/Users/artem/PhpstormProjects/LedgerCraftDocker03`;
> обе папки открываются в одном `.code-workspace`.

## 1. Общие сведения

| Параметр | Значение |
|---|---|
| Связанный репозиторий | `/Users/artem/PhpstormProjects/LedgerCraftDocker03` (Laravel) |
| Канонический контракт | `LedgerCraftDocker03/docs/API.md` |
| Стек сервера | PHP + Laravel (Sanctum) + PostgreSQL |
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
- поля `id`, `local_id`, `uuid_id`, а также `server_id`/`*_server_id` **вырезаются** из payload
  перед вставкой в БД;
- ✅ **ответ приходит по каждой операции** (задача 3.5): `update`/`delete` подтверждаются
  даже при `affected = 0`, а `update` несуществующей записи → `RECORD_NOT_FOUND`. Клиент считает
  операцию доставленной **только** по явному ответу, иначе возвращает её в `pending`;
- ✅ **идемпотентность** (задача 3.5): `insert` — «найти или вставить/обновить» по `uuid_id`
  (уникальный индекс у всех синкаемых таблиц), у `order_service` — по `order_id + service_id`.
  Повторная отправка того же батча дублей не создаёт;
- ✅ **частичный откат** (перенос из Go, задача 3.11): каждая операция в `SAVEPOINT sync_op`,
  при ошибке — `ROLLBACK TO SAVEPOINT`, остальной батч применяется;
- неизвестная таблица или битая структура операции → запись в `errors` с `Invalid operation structure or table.`;
- `MISSING_ID_FOR_UPDATE` / `MISSING_ID_FOR_DELETE` — если в payload нет `id` (серверного);
- ошибки БД ловятся (`QueryException`) и возвращаются в `errors`;
- `last_sync_id` (анти-эхо) проставляется при insert/update/soft-delete — ✅ колонка есть у всех
  синкаемых таблиц (миграция `2026_09_13_000000_add_last_sync_id_to_sync_tables`, задача 3.6).

**Спец-обработка `orders`** (не все поля!): сервер принимает только
`specialization_id, client_id, hours, minutes, total_amount, comments` — остальное игнорируется.
`total_amount` — **в рублях** (без конверсии).

**Спец-обработка `order_service`**: сервер ждёт `order_id`/`service_id` уже как **серверные**
ID и `sale_price`/`quantity`; если `sale_price` не передан, берётся цена из таблицы `services`.
✅ `insert` дедуплицируется по `order_id + service_id` (у связки на сервере нет своего PK),
`delete` — тоже по натуральному ключу (`payload.order_id` + `payload.service_id`); `uuid_id`
хранит клиентский id строки, по нему клиент сопоставляет запись с серверной (задача 3.5).

### `$tables` — какие таблицы принимает синк

Актуальный список (после задачи 0.8):

`clients, specializations, orders, equipment_models, incoming_products, materials, order_product,
order_service, products, product_categories, product_stocks, categories, services,
buy_product_prices, sales_products_prices`

✅ Ранее список был битым (`by_product_prices`, `sales_product_prices`, лишняя `service_categories`) —
исправлено в задаче 0.8.

⚠️ `order_material` в списке нет и такой таблицы на сервере не существует (см. §4.10); клиент её
имеет (миграция 021) — по решению D2 новая серверная таблица не создаётся.

### 2.2. `GET /api/sync-updates` — инкрементальная выгрузка изменений

Реализация: `SyncController::fetchUpdates()`.

```
GET /api/sync-updates?table=<table>&since=<ms>
Headers: X-Sync-ID: <uuid устройства>
```

- `since` — число **миллисекунд** (`Carbon::createFromTimestampMs`);
- если таблица не входит в `$tables` → `400 { "error": "Invalid or missing table" }`;
- ✅ фильтр анти-эха (задача 3.6): записи с `last_sync_id == X-Sync-ID` исключаются — устройство
  не получает свои же изменения; правка чужого устройства вернёт запись автору;
- soft-delete: `whereNull('deleted_at')` применяется только к `clients, products, services, categories`
  (при этом `deleted_at` есть ещё у `orders`, `equipment_models`, `order_service` — §4.13);
- сортировка по `updated_at`;
- ⚠️ роут без auth и без владельца: выдача не фильтруется по пользователю (§4.14);
- ⚠️ нет `limit`/пагинации — устройство после долгого офлайна получает таблицу целиком (§4.18).

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

1. ✅ **Имена таблиц в `$tables` (сервер): исправлено** (задача 0.8) — `buy_product_prices`,
   `sales_products_prices`, `service_categories` убрана. Готово.
2. ✅ **Идемпотентность (задача 3.5): исправлено.** Миграция
   `2026_09_12_000000_add_uuid_id_to_sync_tables` добавила `uuid_id` (unique) всем синкаемым
   таблицам; `insert` — «найти или вставить/обновить» по `uuid_id = local_id` (у `order_service` —
   по `order_id + service_id`). Повторная отправка батча дублей не создаёт. Клиент считает
   операцию доставленной только по явному ответу сервера (иначе возвращает в `pending`).
3. ✅ **Анти-эхо `last_sync_id` (задача 3.6): исправлено.** Миграция
   `2026_09_13_000000_add_last_sync_id_to_sync_tables` добавила колонку (nullable + index) всем
   синкаемым таблицам; сервер проставляет её значением `X-Sync-ID` при insert/update/soft-delete,
   а `fetchUpdates` отдаёт только записи с чужой меткой (`last_sync_id != X-Sync-ID OR
   last_sync_id IS NULL`; строки без метки — например заведённые вручную — видны всем).
4. **Soft-delete:** `tableHasSoftDeletes()` учитывает только `clients, products, services,
   categories`, тогда как фронт ожидает `deleted_at` у многих таблиц (orders, equipment_models…).
5. **Деньги:** все цены — в **рублях** и на клиенте, и на сервере (`total_amount` без
   конверсии). ✅ согласовано (задача 2.3).
6. **`orders` при синке:** сервер берёт только часть колонок
   (`specialization_id, client_id, hours, minutes, total_amount, comments`) — поля
   `status, paid, model_id, share_token` при **insert** из синка теряются.
7. ✅ **Частичный откат `/sync` (SAVEPOINT, перенос из Go — задача 3.11):** каждая операция
   обёрнута в `SAVEPOINT sync_op`, при ошибке — `ROLLBACK TO SAVEPOINT`, поэтому битая операция
   не «вешает» транзакцию на PostgreSQL и не откатывает остальной батч.
8. ✅ **`order_product` подключён к синку** (задача 3.4): фронт отправляет строки товаров заказа
   (`order_id`/`product_id` — серверные id, `sale_price`/`quantity`), сервер принимает их generic-путём
   (таблица в `$tables`, timestamps есть), обратная выдача работает через `applyServerRecord`.
9. ✅ **Серверный агент-лог: убран** (задача 0.9). Готово.
10. ✅ **Ручные позиции материалов** (задача 3.4, решение D2): клиент синкает их в **существующую**
    серверную таблицу `materials` (`order_id, name, price, amount`) — новая серверная таблица
    `order_material` не создаётся, клиентский справочник `materials` (миграция 018) и локальная
    `order_material` (021) удалены миграцией 023. Ранее операция с `table: order_material` падала бы
    с `Invalid operation structure or table.`
11. ✅ **Семантика `materials` сведена** (D2, 3.4): и на клиенте, и на сервере под этим именем —
    **строки материалов заказа**. `LedgerCraftDocker03/docs/DB.md` описывает `materials` верно.
    Осталось продуктовое расширение (`buy_price` для маржи) — задачи 9.5/9.6.
12. **`orders` при insert из синка теряет ещё и `user_id`/`user_order_number`**, не только
    `status`, `paid`, `model_id`, `share_token` (см. п. 6): заказ с устройства приезжает на сервер
    **без владельца**, а статистика фильтрует по `status='done'` и `paid=1` — то есть не увидит его.
13. **Удаления не доезжают до других устройств.** `tableHasSoftDeletes()` знает 4 таблицы, но
    `deleted_at` реально есть ещё у `orders` (миграция `2026_02_11_133000_add_soft_deletes_to_orders_table`),
    `equipment_models`, `order_service`. Итог: удаление заказа через `/sync` — hard-delete, а
    `sync-updates` отдаёт уже удалённые заказы обратно → на втором устройстве фантом навсегда.
14. **Синк без владельца:** `/sync` и `/sync-updates` — без auth (`routes/api.php:152-153`);
    `X-Sync-ID` — метка устройства, не авторизация; выдача не фильтруется по пользователю.
15. **Дубли и мёртвые роуты + IDOR:** `GET /get_orders_by_user` объявлен 3 раза (Laravel берёт
    первую регистрацию — публичную, она падает в 500 на `Auth::user()->getAuthIdentifier()`, а
    рабочая sanctum-версия недостижима); `GET /get_orders_by_user/{id}` отдаёт заказы **любого**
    пользователя; `update_paid_status` и `switch_paid_status` дублируют операцию; `auth:api`
    (token-guard, у `users` нет `api_token`) — тупик рядом с рабочим `auth:sanctum`;
    `MaterialController::create` не зароутен и вызывает `createMaterial($data, $orderId)` при
    сигнатуре `createMaterial($orderId, array $data)`; scaffold `app/Http/Controllers/Auth/*`.
16. **Три методики «выручки»** в `StatisticRepository`: `SUM(CAST(services.price AS numeric))`,
    `SUM(order_service.quantity * sale_price)`, `SUM(orders.total_amount)` (последнее — без фильтров
    `paid/status`) → цифры на одном экране не сойдутся.
17. **`services.price` — VARCHAR** (`2023_10_03_045859_chenge_price_columne`), поэтому в SQL
    приходится писать `CAST(... AS numeric)`; `materials.price` — `decimal(10,2)`, суммы заказов —
    целые. Единый стандарт «рубли целыми» не соблюдён (задача 3.12).
18. **`fetchUpdates` без `limit`/пагинации** — после долгого офлайна устройство получает таблицу
    целиком (память/трафик). Курсор выдачи и анти-эхо уже на месте (задачи 3.6), лимиты — нет.
19. **Склад:** остаток ведётся по товару (`product_stocks.product_id`), но строка дублирует
    категорию (`product_stocks.product_categories_id` vs `products.product_category_id` —
    два источника «где лежит»); `buy_product_prices`/`sales_products_prices` не читаются ни в одном
    расчёте → маржа не считается (задачи 9.3, 9.5).
20. **Go-сайдкар `sync/`** дублирует контракт с устаревшим списком таблиц
    (`service_categories`, `by_product_prices`, `sales_product_prices`), `tablesWithLastSyncID` пуст,
    к nginx/Traefik не подключён → решение D1 (задача 3.11).
21. **Web-часть бэкенда — второй клиент** (`resources/js/components/*` на Vue 3 + Vite + Bootstrap/
    Vuetify/jQuery, blade'ы `home/catalog/order/history/statistic` + `order-report`, `Auth::routes()`,
    session-auth) плюс отдельная раздача HCP (`hcp/chcp.json`, `/download-apk`). Открытый вопрос:
    продукт это или легаси — влияет на задачу 7.6.

## 5. Серверные задачи — привязка к трекеру

Канонический список живёт в `LedgerCraftDocker03/docs/API.md` §7. Ниже — как эти задачи вплетены
в `TODO.md` (метки `[BE]` / `[FE+BE]`):

| Задача | Что сделать | Основные файлы |
|---|---|---|
| 0.8 ✅ | `$tables` приведён к реальным таблицам | `SyncController` |
| 0.9 ✅ | убран `#region agent log` | `SyncController` |
| 3.9 | удаления-«доезжают»: расширить `tableHasSoftDeletes`, отдавать tombstones | `SyncController` |
| 3.10 | владелец: `/sync` под `auth:sanctum`, сохранять `user_id`, фильтровать выдачу, закрыть IDOR | `routes/api.php`, `SyncController`, `OrderController` |
| 3.11 ⏳ | SAVEPOINT-изоляция + вырезание `server_id`/`*_server_id` ✅ (вместе с 3.5); осталось: вынести Go-сайдкар, убрать сервис `sync` из `docker-compose.yaml` | `SyncController`, `docker-compose.yaml`, `sync/` |
| 3.12 | типы денег: `services.price` → целые рубли, убрать `CAST` | миграции, `StatisticRepository` |
| 3.5 ✅ | идемпотентность: `uuid_id` (unique) на синкаемых таблицах + «найти или вставить/обновить»; явный ответ по каждой операции; `order_service` — по `order_id + service_id`; тест `SyncControllerTest` | миграции, `SyncController`, `tests/Feature` |
| 3.6 ✅ | колонки `last_sync_id` (анти-эхо) + простановка в `SyncController` (включая `order_service`) | миграции, `SyncController`, тесты |
| 3.4 ✅ | `order_product` и ручные позиции материалов в синк (по D2) | `SyncController`, миграции — **правок не потребовалось**: обе таблицы уже в `$tables`, timestamps есть, generic-путь insert/update/delete/fetch работает |
| 9.2 | `arrival_product`: явный ответ + идемпотентность | `ProductController` |
| 9.3 | цены/остатки: убрать дубль `product_stocks.product_categories_id` | `ProductStock*` |
| 9.5 | маржа: `buy_price` в позициях заказа + расчёт | миграции, `StatisticRepository` |
| 9.6 | ручные позиции материалов: одна таблица на обеих сторонах | миграции, `Material*`, `docs/DB.md` |
| 9.1 | свести методику «выручки» к одной | `StatisticRepository` |
| 7.6 | гигиена API: дубли/мёртвые роуты, scaffold `Auth/*`, `auth:api` | `routes/api.php`, `app/Http/Controllers/Auth/*` |
| 5.6 | тесты `SyncController` (PHPUnit) | `tests/Feature` |

## 6. Решения (приняты 11.09.2026)

- **D1. Синк — только Laravel.** `/api/sync` + `/api/sync-updates` остаются единственным
  транспортом; Go-сайдкар `sync/` выносится из `master` в песочницу (эксперимент «ускорение +
  практика языка» закрыт), но из него переносим в `SyncController` **SAVEPOINT-изоляцию операций**
  и **вырезание `server_id`/`*_server_id`**. Причина: две реализации одного контракта уже
  разошлись (§4.20), а узкое место синка — не язык, а идемпотентность, курсор и лимиты выдачи.
- **D2. Материалы = позиции заказа.** Продуктовый замысел: мастер закупает товар, делает наценку
  и продаёт клиенту «от себя», а купленное на стороне вписывает вручную. Этому соответствуют две
  существующие сущности: товар со склада → `order_product` (списание/возврат остатка) и ручная
  позиция → строки материалов заказа (`order_id, name, price, amount`). В **обе** позиции
  добавляется `buy_price` (себестоимость) → считается маржа/наценка. Клиентский справочник
  `materials` (миграция 018) удаляется; **новая таблица `order_material` не создаётся** (её роль
  выполняет серверная `materials`, предлагается общее имя `order_material` — задача 9.6).
- **Открыто:** web-часть бэкенда — продукт или легаси (влияет на 7.6 и на судьбу `/order-report`).