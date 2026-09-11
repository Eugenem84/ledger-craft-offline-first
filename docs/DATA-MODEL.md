# Модель данных: локальная БД клиента

Схема таблиц **локальной** БД (по миграциям `src/database/migrations/`) и маппинг на серверные
поля. Серверная схема (PostgreSQL) описана в бэкенде: `LedgerCraftDocker03/docs/DB.md`.
Для всех таблиц общее:

- `id` — локальный UUID (`TEXT PRIMARY KEY`), на сервер не отправляется;
- `server_id` — серверный id (`INTEGER/BIGINT`), `NULL` пока запись не синхронизирована;
- `created_at`, `updated_at` — по умолчанию `strftime('%s','now')` (UNIX-секунды);
- `deleted_at` — soft-delete (`NULL` = живая запись).

## Таблицы, участвующие в синхронизации

### specializations (специализации мастерской)
| колонка | тип | примечание |
|---|---|---|
| id | TEXT PK | локальный UUID |
| server_id | bigint | |
| name | varchar(255) | на сервере называется `specialization_name`! |

### categories (категории работ)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | bigint |
| specialization_id | bigint — на сервере это FK на specializations |
| category_name | varchar(255) |

### services (работы/услуги)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | BIGINT |
| category_id | TEXT (локальный UUID) |
| service | varchar(255) — название работы |
| price | INTEGER |

### product_categories (категории товаров на складе)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | BIGINT |
| name | varchar(255) |
| specialization_id | TEXT — локальный UUID; после серверного сика в неё попадает server_id |
| specialization_server_id | BIGINT |

### products (товары)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | BIGINT |
| name | varchar(255) |
| description, manufacturer, product_number | TEXT/VARCHAR |
| weight | REAL |
| base_sale_price | INTEGER — цена в рублях |
| product_category_id | TEXT |
| product_category_server_id | BIGINT |

### equipment_models (модели техники)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | INTEGER |
| name | TEXT |
| specialization_id | TEXT |
| specialization_server_id | INTEGER |

### clients (клиенты)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | bigint |
| specialization_id | TEXT |
| specialization_server_id | bigint |
| name | varchar(255) |
| phone | varchar(255) |

### orders (ордеры/заказы)
| колонка | тип | примечание |
|---|---|---|
| id | TEXT PK | |
| server_id | INTEGER | |
| specialization_id / specialization_server_id | TEXT / INTEGER | |
| client_id / client_server_id | TEXT / INTEGER | |
| hours, minutes | INTEGER | длительность работ |
| total_amount | INTEGER | **в рублях** (единый стандарт; конверсии нет) |
| comments | TEXT | |
| user_id, user_order_number | INTEGER | |
| status | TEXT | waiting / process / done |
| paid | INTEGER | 0/1 |
| model_id / model_server_id | TEXT / INTEGER | модель техники |
| share_token | TEXT | публичная ссылка на отчёт |

### order_service (работы в ордере) — связная таблица
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | INTEGER |
| order_id / order_server_id | TEXT / INTEGER |
| service_id / service_server_id | TEXT / INTEGER |
| sale_price | REAL — рубли |
| quantity | INTEGER |

## Таблицы, НЕ участвующие в синхронизации (внимание!)

> По решению **D2** часть этого списка закрывается договорённостью: `order_product` и ручные
> позиции материалов (`order_material`) подключаются к синку (задача 3.4), клиентский справочник
> `materials` (миграция 018) удаляется (задача 9.6).

### order_product (товары в ордере)
Создана миграцией 013 (дубли 019/022 удалены в задаче 2.1):
`id, server_id, order_id, product_id, sale_price, quantity, created_at, updated_at, deleted_at`.
**Не внесена в `syncService.repos`** → создаётся локально, но на сервер уходит без
трансформации FK (`order_id` = локальный UUID), а с сервера не обновляется.

### order_material (материалы в ордере)
Схема по миграции 021: `id, server_id, order_id, order_server_id, material_id,
material_server_id, price, amount, created_at, updated_at, deleted_at`.
**Не внесена в `syncService.repos`** → та же проблема, что у order_product.

⚠️ По решению **D2** это будущая **ручная позиция заказа** («купил на стороне») и одна из двух
частей модели материалов: поля приводятся к серверным (`order_id, name, price, amount` + `buy_price`
для маржи), связка `material_id` → справочник уходит вместе с ним. Подключение к синку — задача **3.4**,
приведение модели — задача **9.6**.

### materials (клиентский «справочник») — ❌ отменён решением D2
`id, server_id, name, specialization_id, ...` — создаётся миграцией 018, но **не
синхронизируется вовсе** (нет ни в repos, ни в fkTransformationMap).

⚠️ По решению **D2** этот справочник **удаляется**. Продуктовая модель материалов: мастер закупает
товар и продаёт с наценкой (это существующий цикл `products`/`product_stocks`/`incoming_products` →
`order_product`), а купленное на стороне вписывает вручную (ручная позиция заказа). На сервере под
именем `materials` лежат **именно строки материалов заказа** (`order_id NOT NULL, name,
price decimal(10,2), amount`) — то есть семантический аналог клиентской `order_material`, а не
справочник. Задача **9.6** сводит обе стороны к одной таблице (предлагается имя `order_material`).

### incoming_products (приход товаров на склад) — запланирована, не подключена к офлайн-слою
Создана миграцией 012 (дубль 016 удалён в задаче 2.1). Схема: `id, server_id, product_id,
supplier, quantity, by_price, created_at, updated_at, deleted_at`.

**Назначение:** оприходование товара от поставщика (приход на склад). UI уже существует —
`pages/dialogs/ArrivalProductDialogPage.vue` (кнопка «Поступление» в `ProductDialogPage.vue`).
На сервере есть `POST /arrival_product` (`ProductController::arrival`), который обновляет
`products.base_sale_price`, увеличивает `product_stocks.quantity` и пишет запись сюда.
⚠️ Сейчас фронт шлёт запрос **напрямую** (`boot/axios.js` с фиктивным `baseURL`), а не через
офлайн-очередь `operations` — фактически не работает. Реализация — задача **9.2**.
✅ Имя колонки приведено к серверному: `by_price` (не `buy_price`).

### product_stocks (остатки товара на складе) — запланирована, не подключена
Создана миграцией 008. Схема: `id, server_id, product_id, quantity, supplier, ...`.

**Назначение:** текущий остаток товара на складе. `StorePage.vue` отображает
`product.quantity`, но источник данных отсутствует: `queries/products.js` не джойнит
`product_stocks`, а в самой таблице `products` колонки `quantity` нет — поэтому остаток
сейчас **не показывается**. Реализация — задача **9.3**.

### buy_product_prices (закупочные цены) — запланирована, не подключена
Создана миграцией 009. Схема: `id, server_id, product_id, buy_price, ...`.

**Назначение:** хранить закупочную цену товара (себестоимость) — для маржинальности и
отчётов. Реализация — задача **9.3**.

### sales_products_prices (цены продажи) — запланирована, не подключена
Создана миграцией 010 (дубль 023 удалён в задаче 2.1). Схема: `id, server_id, product_id,
order_id, sale_price, ...`.

**Назначение:** фиксировать цену, по которой товар был продан в каждом заказе — для
аналитики продаж и маржи. Реализация — задача **9.3**.

> **Итог по этим таблицам:** это НЕ мусор — у каждой есть ясное назначение (приходы,
> остатки, учёт цен). Они созданы схемой, частично используются UI и сервером, но ещё не
> подключены к репозиториям/сторам/офлайн-синку. Решение задачи 2.6 — **оставить и
> задокументировать**, а подключение выполнить в задачах 9.2 и 9.3.

## Служебные таблицы

### migrations
`id TEXT PK, applied_at TEXT` — учёт применённых миграций (создаётся в boot-файле).

### operations (очередь синхронизации)
`id TEXT PK, type TEXT (insert|update|delete), "table" TEXT, payload TEXT (JSON),
created_at INTEGER DEFAULT strftime('%s','now')`.

### meta
`key TEXT PK, value TEXT` — `last_synced_at` (epoch-мс) и прочие метаданные.

## Маппинг серверных id в FK

При отправке на сервер (local→server) syncService заменяет FK пары:
`xxx_id → xxx_server_id` (если server_id найден) либо берёт готовое `*_server_id` из payload.

При загрузке (server→local) `applyServerRecord` переводит серверные id обратно в локальные
UUID (по `findByServerId` в таблице-родителе). ⚠️ Порядок загрузки таблиц в `repos` важен:
родители (`specializations`, `categories`, `clients`, `equipment_models`) должны прийти
раньше детей (`services`, `products`, `orders`, `order_service`).

## Единицы измерения и деньги — единый стандарт

**Все денежные поля хранятся и передаются в РУБЛЯХ.** Никаких копеек и конверсий `*100`/`/100`:
- локальная БД — рубли (`total_amount`, `sale_price`, `price`, `base_sale_price`);
- сервер (Laravel) — рубли;
- UI — рубли.

Ранее была путаница (зачатки копеечной схемы); устранена в задаче 2.3: конверсия `*100`/`/100`
из `ordersRepo` удалена, тип колонок не менялся (SQLite хранит и дробные рубли в `INTEGER`-колонке).

| Поле | Локально | На сервер |
|---|---|---|
| created_at / updated_at | UNIX-секунды (INTEGER) | могут приходить ISO-строками из Laravel |
| last_synced_at (meta) | Date.now() — миллисекунды | клиент шлёт `since` в ms; сервер сравнивает по-своему |