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
| Base URL (dev-VPS) | `https://dev.medovf2h.beget.tech/api` — песочница, обкатка новых фич |
| Base URL (prod-VPS) | `https://<prod-домен>/api` — боевой контур (домен уточняется, TODO 11.1) |
| Идентификация клиента | заголовок `X-Sync-ID` (UUID из `localStorage` устройства) |
| Формат данных | JSON |
| Клиент | axios (`src/services/api.js`) |

Идентификация по `X-Sync-ID` **не является авторизацией** — это просто метка устройства (анти-эхо).
Отдельно есть настоящая авторизация: `POST /api/register`, `POST /api/login` (Sanctum),
`/api/me`, `/api/logout`, `/api/delete-account`.

`POST /api/register` (Фаза 10, задача 10.5) принимает необязательный массив
`specializations: [{ name, preset_key }]`, создаёт рабочие профили и возвращает их
(`{ access_token, token_type, user, specializations }`); клиент кладёт их локально
без операции в очередь и материализует пресеты — новый пользователь видит готовый каталог.

С задачи 3.10 синк **требует токен**: `/api/sync` и `/api/sync-updates` — под `auth:sanctum`.
Клиент подставляет `Authorization: Bearer <token>` из `localStorage.auth_token` (`src/services/api.js`);
выдача/запись ограничены данными пользователя (напрямую `user_id` или через цепочку родителей).
Вход в приложение и получение токена — задача 7.4 (до неё сервер отвечает `401`, операции просто
остаются в очереди).

## 2. Эндпоинты

### 2.1. `POST /api/sync` — отправка локальных изменений

Реализация: `SyncController::sync()`. Тело заворачивается в одну транзакцию БД.

```
POST /api/sync
Headers: Content-Type: application/json
         X-Sync-ID: <uuid устройства>
         Authorization: Bearer <sanctum-токен>      // задача 3.10
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
  синкаемых таблиц (миграция `2026_09_13_000000_add_last_sync_id_to_sync_tables`, задача 3.6);
- ✅ **`updated_at` в ответе** (задача 3.8): у каждой подтверждённой операции — версия записи
  ISO-8601 UTC, ровно та, что записана в БД. Клиент применяет её локально (`markSynced`), чтобы
  версии клиента и сервера совпадали;
- ✅ **владелец данных** (задача 3.10): без токена — `401`; вставка привязывается к чужому
  родителю → `FORBIDDEN_NOT_OWNER`; `update`/`delete` чужой записи → `RECORD_NOT_FOUND`;
- ✅ **деньги — целые рубли** (задача 3.12): сервер принимает строки/«1 000,50» и нормализует
  (`1501`), `''` у услуги → `0`.

**Спец-обработка `orders`** (не все поля!): сервер принимает только
`specialization_id, client_id, hours, minutes, total_amount, comments, equipment_identifier` —
остальное игнорируется. `total_amount` — **в рублях** (без конверсии),
`equipment_identifier` — универсальный идентификатор объекта (Фаза 10, задача 10.9).

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
         Authorization: Bearer <sanctum-токен>      // задача 3.10
```

- `since` — число **миллисекунд** (`Carbon::createFromTimestampMs`);
- если таблица не входит в `$tables` → `400 { "error": "Invalid or missing table" }`;
- ✅ владелец данных (задача 3.10): выдаются только записи пользователя из токена (цепочка
  `specializations.user_id` / `orders.user_id`), «ничьи» legacy-строки — тоже;
- ✅ фильтр анти-эха (задача 3.6): записи с `last_sync_id == X-Sync-ID` исключаются — устройство
  не получает свои же изменения; правка чужого устройства вернёт запись автору;
- ✅ **удаления (задача 3.9)**: soft-deleted строки приходят с `deleted: true` и `deleted_at`
  (у `clients`, `products`, `services`, `categories`, `equipment_models`, `orders`, `order_service`),
  а у таблиц без `deleted_at` добавляются tombstones
  `{ id, uuid_id, deleted: true, deleted_at, updated_at }`;
- ✅ время — ISO-8601 UTC (задача 3.8), сортировка по `updated_at`;
- ⚠️ нет `limit`/пагинации — устройство после долгого офлайна получает таблицу целиком (§4.18).

Ответ:

```json
{ "table": "clients", "count": 2, "records": [ { "id": 1, "deleted": false, ... }, ... ] }
```

`id` в записях — **серверные** id (клиент пишет их в `server_id`), `deleted` — признак удаления
(по нему `syncService._applyServerDeletion` убирает запись локально). Для вставки новой записи
клиенту нужны `created_at`/`updated_at` (ISO-8601 UTC).

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

Валидация: `product_id` — обязателен, должен существовать в `products`
(строки остатка у товара может ещё не быть — товар мог приехать из синка, задача 9.2);
`arrival_quantity` — целое ≥ 1.

Сервер выполняет всё **в одной транзакции**:
1. `IncomingProductRepository::recordArrival(...)` — пишет `incoming_products`; если приход
   с таким `uuid_id` уже есть, строку только правит;
2. `ProductStockRepository::arrival(...)` — создаёт строку остатка при необходимости и
   увеличивает `product_stocks.quantity` **ровно один раз** (не при повторе);
3. `ProductRepository::arrivalUpdate(productId, baseSalePrice)` — если передана цена продажи.

Идемпотентность — по `uuid_id` (его присылает приложение; web может не присылать — тогда
два запроса = два прихода, как и раньше).

Возврат (201 при новом приходе, 200 при повторе):

```json
{
  "message": "Приход сохранён",
  "idempotent": false,
  "incoming_product_id": 7, "product_id": 12, "quantity": 10, "stock_quantity": 10
}
```

✅ Приложение эту ручку **больше не вызывает**: приход сохраняется офлайн
(`incomingProductsRepo.receiveArrival` → локальные таблицы + очередь синка), а остаток
считает сервер при обработке операции `incoming_products` (задача 9.2).
⚠️ Ручка ходит **без `auth`** (как и раньше): web-версия вызывает её без токена, поэтому
приходовать товар «на удачу» может кто угодно — закрытие вынесено в отдельную задачу.

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
| GET | `/api/specialization-templates` (sanctum) | `SpecializationTemplateController::index` (пресеты, 10.7) |
| GET | `/api/orders_by_specialization/{id}` | `OrderController::getBySpecialization` |
| GET | `/api/get_total_DWYM/{specializationId}`, `/api/get_top_services/{specializationId}`, `/api/get_top_profit_clients/{specializationId}`, `/api/get_top_products/{specializationId}`, `/api/get_top_materials/{specializationId}`, `/api/get_orders_status/{specializationId}`, `/api/income_by_year/{specializationId}` | `StatisticController` (единая методика — §4.16) |
| GET | `/api/app-quasar-android-version`, `/api/download-apk`, `/api/hcp/chcp.json` | `AppVersionController` |

> Страница аналитики приложения эти ручки **не вызывает**: она считает по локальной БД
> (`analyticsRepo` + `src/utils/analytics.js`, задача 9.1) — офлайн-первый подход. Серверные
> отчёты нужны web-версии и сверке цифр: методика на обеих сторонах одна и та же.

`share-link` возвращает `{ "url": "..." }`; вызывается из стора заказа
(`useOrderDraftStore.generateShareLink`, задача 9.4) — прямых вызовов из `*.vue` нет (8.2).
Маршрут под `auth:sanctum` и отдаёт ссылку **только владельцу** заказа (на чужой/несуществующий
заказ — 404: перебор id не должен выдавать чужие отчёты). Повторный запрос возвращает **ту же**
ссылку (токен создаётся один раз), поэтому ранее отправленные клиенту ссылки не ломаются.

Ссылка открывает **публичную** Blade-страницу `GET /order-report/{order}?token=...`: доступ даёт
именно `token`, без него или с чужим — 404 (раньше параметр игнорировался и отчёт читался по
одному `id`). `share_token` — **серверное** поле: из payload синка оно вырезается
(`SyncController::stripClientFields`), иначе правка заказа с клиента (у него токена нет, он
прислал бы `null`) затирала бы уже выданную ссылку.

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
4. ✅ **Soft-delete (задача 3.9): исправлено.** `tableHasSoftDeletes()` теперь спрашивает схему
   (`Schema::hasColumn($table, 'deleted_at')`), поэтому soft-delete работает и для `orders`,
   `equipment_models`, `order_service`. Для таблиц без `deleted_at` заведена `sync_tombstones`,
   а `sync-updates` отдаёт удаления как `deleted: true` — клиент убирает запись у себя.
5. **Деньги:** все цены — в **рублях** и на клиенте, и на сервере (`total_amount` без
   конверсии). ✅ согласовано (задача 2.3).
6. **`orders` при синке:** сервер берёт только часть колонок
   (`specialization_id, client_id, hours, minutes, total_amount, comments`) — поля
   `status, paid, model_id` при **insert** из синка теряются; `share_token` не принимает
   ни insert, ни update — это сознательно **серверное** поле публичной ссылки (задача 9.4).
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
    ✅ Продуктовое расширение сделано (9.5/9.6): в обеих позициях заказа (`order_product` и
    `materials`) есть `buy_price` — себестоимость на момент продажи, из неё считается маржа.
12. ✅ **Владелец заказа из синка (задача 3.10): исправлено** — `orders.user_id` теперь проставляется
    из токена. По-прежнему теряются `status`, `paid`, `model_id`, `user_order_number`
    (см. п. 6) — статистика (`status='done'`, `paid=1`) такие заказы не увидит, это отдельная работа;
    `share_token` — иное: его сервер **не принимает сознательно** (9.4), это его собственное поле.
13. ✅ **Удаления доезжают (задача 3.9): исправлено.** Soft-delete по схеме + `sync_tombstones`
    для остальных таблиц; `sync-updates` отдаёт `deleted: true`/`deleted_at`, клиент применяет
    удаление и снимает «висящие» операции (удаление заказа убирает его строки каскадом).
14. ✅ **Владелец данных (задача 3.10): исправлено.** `/sync` и `/sync-updates` — под
    `auth:sanctum`; `user_id` проставляется при вставке, `update`/`delete` работают только со своими
    записями, выдача фильтруется по цепочке владельцев. ⚠️ «Ничьи» legacy-строки видны всем — их
    нужно разово привязать к пользователю; вход/токен на клиенте — задача 7.4.
15. **Дубли и мёртвые роуты + IDOR:** IDOR закрыт в задаче 3.10 — `GET /get_orders_by_user/{id}` и
    публичный `/get_orders_by_user` удалены (остался sanctum-вариант без `id`). Осталось на 7.6:
    `update_paid_status` + `switch_paid_status` дублируют операцию; `auth:api` (token-guard, у `users`
    нет `api_token`) — тупик рядом с рабочим `auth:sanctum`; `MaterialController::create` не зароутен
    и вызывает `createMaterial($data, $orderId)` при сигнатуре `createMaterial($orderId, array $data)`;
    scaffold `app/Http/Controllers/Auth/*`.
16. ✅ **Три методики «выручки» (задача 9.1): исправлено.** Методика теперь одна и живёт в одном
    месте — `StatisticRepository::billedOrdersSubquery()`: учитываются только «учтённые» заказы
    (`status = 'done'`, `paid = true`, `deleted_at IS NULL`), выручка — сумма позиций (работы
    `order_service.quantity * sale_price` + товары `order_product.quantity * sale_price` + ручные
    материалы `materials.amount * price`), период — по `orders.updated_at`, цена позиции важнее
    каталожной `services.price`. Через этот подзапрос считаются DWMY, топы (услуги/клиенты/товары/
    материалы), `getStatsByPeriod` (теперь ещё и средний чек: выручка / число учтённых заказов) и
    выручка по дням/неделям/месяцам/году — цифры сходятся между собой. Добавлены ручки
    `/api/get_top_products`, `/api/get_top_materials`, `/api/get_orders_status`. Тест:
    `tests/Feature/StatisticRepositoryTest.php`. Клиент считает аналитику **локально** по той же
    методике (см. §2.4) — `src/utils/analytics.js`, страница `AnalyticPage.vue`,
    тесты `test/analytics.test.js` + `test/analytics-repo.test.js` (контрольные цифры совпадают).
17. ✅ **`services.price` (задача 3.12): исправлено.** Миграция
    `2026_09_15_000000_services_price_to_integer` привела колонку к `integer` (нечисловое → 0,
    десятичные округляются), `CAST(... AS numeric)` из `StatisticRepository` убран, payload синка
    нормализуется (`'1 500,50'` → `1501`). `materials.price` в схеме — `bigint`, остальные суммы —
    `integer`: единый стандарт «рубли целыми» соблюдён.
18. **`fetchUpdates` без `limit`/пагинации** — после долгого офлайна устройство получает таблицу
    целиком (память/трафик). Курсор выдачи и анти-эхо уже на месте (задачи 3.6), лимиты — нет.
19. ✅ **Склад (задача 9.3): исправлено.** Дубль источника убран — `product_stocks.product_categories_id`
    удалён (миграция `2026_09_16_000000`), «где лежит товар» знает только
    `products.product_category_id`; список склада собирается из товаров (`LEFT JOIN` остатка, товар без
    строки виден с нулём, soft-deleted исключены). `buy_product_prices` и `sales_products_prices`
    теперь **читаются**: `/api/get_products/{id}` отдаёт `quantity`, `buy_price`, `last_sale_price`;
    приложение фиксирует цену продажи в момент продажи товара и показывает на складе
    остаток/закупку/продажу/последнюю продажу. Остаётся задача 9.5: маржа и наценка по закупке в
    отчётах пока не считаются.
20. ✅ **Go-сайдкар `sync/` (задача 3.11): вынесен из проекта** (решение D1). Код (`sync/`,
    `_docker/sync/`) и сервис `sync` из `docker-compose.yaml` удалены, копия — в песочнице
    `../ledger-craft-go-sync-sandbox`. Единственный транспорт — `/api/sync` + `/api/sync-updates`;
    `SAVEPOINT`-изоляция и вырезание `server_id`/`*_server_id` перенесены в Laravel ещё в 3.5.
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
| 3.9 ✅ | удаления-«доезжают»: soft-delete по схеме + `sync_tombstones`, выдача `deleted: true`; клиент применяет удаление | `SyncController`, миграция `2026_09_14_000000`, `syncService` |
| 3.10 ✅ | владелец: `/sync` под `auth:sanctum`, `user_id` из токена, фильтр выдачи по цепочке владельцев, IDOR закрыт | `routes/api.php`, `SyncController` |
| 3.11 ✅ | SAVEPOINT-изоляция + вырезание `server_id`/`*_server_id` (вместе с 3.5); Go-сайдкар вынесен из проекта, сервис `sync` убран из `docker-compose.yaml` | `SyncController`, `docker-compose.yaml`, песочница `../ledger-craft-go-sync-sandbox` |
| 3.12 ✅ | типы денег: `services.price` → `integer`, `CAST` из расчётов убраны, payload нормализуется | миграция `2026_09_15_000000`, `StatisticRepository`, `SyncController` |
| 3.5 ✅ | идемпотентность: `uuid_id` (unique) на синкаемых таблицах + «найти или вставить/обновить»; явный ответ по каждой операции; `order_service` — по `order_id + service_id`; тест `SyncControllerTest` | миграции, `SyncController`, `tests/Feature` |
| 3.6 ✅ | колонки `last_sync_id` (анти-эхо) + простановка в `SyncController` (включая `order_service`) | миграции, `SyncController`, тесты |
| 3.4 ✅ | `order_product` и ручные позиции материалов в синк (по D2) | `SyncController`, миграции — **правок не потребовалось**: обе таблицы уже в `$tables`, timestamps есть, generic-путь insert/update/delete/fetch работает |
| 9.2 ✅ | приход: офлайн-очередь на клиенте (`receiveArrival` → `incoming_products` + `buy_product_prices` + цена товара), сервер — явный ответ, транзакция, идемпотентность по `uuid_id`, остаток увеличивается ровно один раз (строка остатка создаётся по требованию), синк-путь закрыт владельцем | `ProductController::arrival`, `IncomingProductRepository`, `ProductStockRepository`, `SyncController` (ветка `incoming_products`), `tests/Feature/ArrivalProductTest.php` |
| 9.3 ✅ | склад: дубль `product_stocks.product_categories_id` удалён (миграция `2026_09_16_000000`), список категории собирается из товаров, товар из синка получает строку остатка (0), `buy_price`/`last_sale_price` читаются в выдаче товаров; на клиенте `sales_products_prices` пишется при продаже товара и синкается, склад показывает остаток/закупку/продажу | `ProductStockRepository`, `ProductRepository`, `ProductController`, `SyncController`, `tests/Feature/ProductStockTest.php`, `salesProductPricesRepo`, `queries/products.js`, `StorePage.vue` |
| 9.5 | маржа: `buy_price` в позициях заказа + расчёт | миграции, `StatisticRepository` |
| 9.4 ✅ | публичная share-ссылка: `share-link` под `auth:sanctum` + владелец (404 на чужой заказ), токен создаётся один раз; `showReport` открывает отчёт **только по `token`** (без/с чужим → 404); `share_token` вырезается из payload синка (серверное поле) | `routes/api.php`, `OrderController`, `SyncController`, `resources/views/order-report.blade.php`, `tests/Feature/OrderShareLinkTest.php` |
| 9.5 ✅ | маржа/наценка: `buy_price` в `order_product` и `materials` (миграция `2026_09_17_000000`), себестоимость попадает в позицию из payload клиента, иначе подставляется `ProductRepository::lastBuyPrice()` (`buy_product_prices` → приход); деньги нормализуются; маржа/наценка в DWMY, `getStatsByPeriod`, топах (товары/материалы/клиенты); web-путь `OrderRepository` пишет `buy_price` сам | миграция, `SyncController`, `StatisticRepository`, `OrderRepository`, `ProductRepository`, `tests/Feature/{SyncControllerTest,StatisticRepositoryTest}.php` |
| 9.6 ✅ | одна таблица материалов заказа на обеих сторонах: `materials` (+`buy_price`), клиентский справочник и `order_material` отсутствуют (023/024); сквозная проверка «уезжает офлайн → приезжает на второе устройство» вместе с себестоимостью; попутно исправлено падение применения записи заказа с неполным набором полей (`undefined` в bind) | миграции 023/024 + `2026_09_17_000000`, `mappers/orders.js`, `materialsRepo`, `test/sync.test.js`, `docs/DATA-MODEL.md`, `docs/DB.md` |
| 9.6 | ручные позиции материалов: одна таблица на обеих сторонах | миграции, `Material*`, `docs/DB.md` |
| 9.1 ✅ | свести методику «выручки» к одной: `billedOrdersSubquery()` — `status='done'` + `paid` + не удалён, выручка = позиции (работы + товары + материалы), средний чек; топы товаров/материалов и распределение по статусам | `StatisticRepository`, `StatisticController`, `routes/api.php`, `tests/Feature/StatisticRepositoryTest.php` |
| 7.6 | гигиена API: дубли/мёртвые роуты, scaffold `Auth/*`, `auth:api` | `routes/api.php`, `app/Http/Controllers/Auth/*` |
| 5.6 | тесты `SyncController` (PHPUnit) | `tests/Feature` |

## 6. Решения (приняты 11.09.2026)

- **D1. Синк — только Laravel.** `/api/sync` + `/api/sync-updates` — **единственный транспорт**;
  Go-сайдкар `sync/` вынесен из проекта в песочницу `../ledger-craft-go-sync-sandbox` (эксперимент
  «ускорение + практика языка» закрыт, задача 3.11), сервис `sync` убран из `docker-compose.yaml`.
  Из Go-реализации в `SyncController` перенесены **SAVEPOINT-изоляция операций** и **вырезание
  `server_id`/`*_server_id`** (задача 3.5). Причина: две реализации одного контракта уже
  разошлись (§4.20), а узкое место синка — не язык, а идемпотентность, курсор и лимиты выдачи.
- **D2. Материалы = позиции заказа.** Продуктовый замысел: мастер закупает товар, делает наценку
  и продаёт клиенту «от себя», а купленное на стороне вписывает вручную. Этому соответствуют две
  существующие сущности: товар со склада → `order_product` (списание/возврат остатка) и ручная
  позиция → строки материалов заказа (`order_id, name, price, amount`). В **обе** позиции
  добавляется `buy_price` (себестоимость) → считается маржа/наценка. Клиентский справочник
  `materials` (миграция 018) удаляется; **новая таблица `order_material` не создаётся** (её роль
  выполняет серверная `materials`, предлагается общее имя `order_material` — задача 9.6).
- **Открыто:** web-часть бэкенда — продукт или легаси (влияет на 7.6 и на судьбу `/order-report`).