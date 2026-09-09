# Модель данных Ledger Craft

Схема таблиц локальной БД (по миграциям `src/database/migrations/`) и сопоставление
с серверной моделью. Для всех таблиц общее:

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
| base_sale_price | INTEGER — предполагалась копеечная цена? (не согласовано) |
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
| total_amount | INTEGER | **в копейках** (клиент конвертирует `/100`) |
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

### order_product (товары в ордере)
Создана тремя миграциями (013/019/022), фактически живёт по схеме 013:
`id, server_id, order_id, product_id, sale_price, quantity, created_at, updated_at, deleted_at`.
**Не внесена в `syncService.repos`** → создаётся локально, но на сервер уходит без
трансформации FK (`order_id` = локальный UUID), а с сервера не обновляется.

### order_material (материалы в ордере)
Схема по миграции 021: `id, server_id, order_id, order_server_id, material_id,
material_server_id, price, amount, created_at, updated_at, deleted_at`.
**Не внесена в `syncService.repos`** → та же проблема, что у order_product.

### materials
`id, server_id, name, specialization_id, ...` — создаётся миграцией 018, но **не
синхронизируется вовсе** (нет ни в repos, ни в fkTransformationMap).

### incoming_products (приход товаров)
Дубли миграций 012/016. В схеме 016: `id, server_id, product_id, product_server_id,
supplier, quantity, by_price, ...`. Не синкается.

### product_stocks, buy_product_prices, sales_products_prices
Таблицы-сироты из ранних миграций (008/009/010, дубль 023 для sales_products_prices).
Ни миграции-«победительницы», ни репозитории, ни синк — фактически не используются.

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

## Единицы измерения и даты — сводка расхождений

| Сущность | Где рубли | Где копейки | Где непоследовательно |
|---|---|---|---|
| orders.total_amount | — | локально и на сервер (+ конвертация /100) | `*Repo` делит/умножает вручную |
| order_service.sale_price | REAL | — | не приводится к копейкам |
| products.base_sale_price | INTEGER | — | непонятно, рубли или копейки |
| материалы/товары в заказе | price (REAL) | — | — |

| Поле | Локально | На сервер |
|---|---|---|
| created_at / updated_at | UNIX-секунды (INTEGER) | могут приходить ISO-строками из Laravel |
| last_synced_at (meta) | Date.now() — миллисекунды | клиент шлёт `since` в ms; сервер сравнивает по-своему |