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

### order_product (товары в ордере) — связная таблица (синкается с 3.4)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | INTEGER |
| order_id | TEXT — локальный UUID заказа |
| product_id | TEXT — локальный UUID товара |
| sale_price | INTEGER — рубли (серверное имя поля) |
| quantity | INTEGER — количество (серверное имя поля) |

> Колонок `order_server_id`/`product_server_id` у таблицы нет: серверные id приходят в ответе и
> живут в родителях (`orders.server_id`, `products.server_id`); на сервер `order_id`/`product_id`
> уходят серверными id (трансформация в `syncService`), а `applyServerRecord` находит локальные
> заказ и товар по их `server_id`.

### materials (ручные позиции заказа) — связная таблица (синкается с 3.4, решение D2)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | INTEGER |
| order_id / order_server_id | TEXT / INTEGER |
| name | TEXT — что куплено «на стороне» |
| price | REAL — рубли |
| amount | INTEGER |

> Создана миграцией 023: заменила клиентский «справочник материалов» (миграция 018) и строки
> `order_material` (миграция 021). На сервере — таблица `materials` (`order_id, name, price, amount`),
> то есть маппинг один-в-один. Поле `buy_price` (себестоимость для маржи) — задачи 9.5/9.6.

## Таблицы, НЕ участвующие в синхронизации (внимание!)

> ✅ `order_product` и ручные позиции материалов подключены к синку в задаче **3.4**
> (см. разделы выше): клиентский справочник `materials` (миграция 018) и строки
> `order_material` (миграция 021) удалены миграцией **023**, данные перенесены.
> Ниже — то, что ещё не подключено к офлайн-слою.

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
status TEXT (pending|sending|synced), created_at INTEGER, updated_at INTEGER`.

- `status` добавлен в задаче 3.3 (миграция 022 для уже установленных БД): `dequeue` берёт
  только `pending`, in-flight операции возвращаются в работу при следующем `sync()`
  (`recoverInFlight`), так что сбой между отправкой и ответом данные не теряет;
- `created_at`/`updated_at` — миллисекунды (`Date.now()` из репозиториев).

### meta
`key TEXT PK, value TEXT`. Курсор выдачи ведётся **на таблицу** (задача 3.6): ключ
`last_synced_at:<table>` (epoch-мс). Старый общий ключ `last_synced_at` читается как начальное
значение, если у таблицы своего курсора ещё нет — плавный апгрейд без перетягивания всего заново.

## Маппинг серверных id в FK

При отправке на сервер (local→server) syncService заменяет FK пары:
`xxx_id → xxx_server_id` (если server_id найден) либо берёт готовое `*_server_id` из payload.

При загрузке (server→local) `applyServerRecord` переводит серверные id обратно в локальные
UUID (по `findByServerId` в таблице-родителе). ⚠️ Порядок загрузки таблиц в `repos` важен:
родители (`specializations`, `categories`, `product_categories`, `clients`, `equipment_models`)
должны прийти раньше детей (`services`, `products`, `orders`, `order_service`, `order_product`,
`materials`). У `order_product`/`materials` родители — `orders` (и `products` у строк товара).

✅ Timestamps: сервер отдаёт `created_at`/`updated_at` ISO-строками, а локальные колонки —
целые UNIX-секунды. Все `applyServerRecord` приводят время хелпером `src/utils/timestamps.js`
(`toEpochSeconds`), поэтому сравнение «чья версия новее» идёт в одних единицах (задача 3.8);
записи, у которых время случайно оказалось в миллисекундах (старый формат), тоже сравниваются
корректно. Правило конфликтов — last-write-wins (см. `docs/ARCHITECTURE.md` §4.2).

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