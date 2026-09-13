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

> **Это «рабочий профиль», а не «тип аккаунта»** (решение **D4**). На сервере
> `User hasMany Specialization` (`specializations.user_id`, миграция `2024_03_08_085324`), а к
> `specialization_id` привязано всё остальное — `categories` → `services`, `product_categories` →
> `products`, `equipment_models`, `clients`, `orders`; синк уже фильтрует выдачу по цепочке
> владельцев (задача 3.10). Поэтому один пользователь может вести несколько специализаций
> («веломастер + аквариумист») — схема это выдерживает уже сейчас, а UI мульти-профиля сделан
> в Фазе 10 (`docs/FRONTEND.md` §9, задачи 10.1–10.9).

**Колонки профиля (Фаза 10, задача 10.6, реализовано):**

| колонка | тип | назначение |
|---|---|---|
| preset_key | TEXT | какой пресет применён (`bike` / `aquarium` / `hvac` / `auto`); задаёт лексикон терминов и акцент UI |
| accent | TEXT | акцентный цвет профиля (применяется через `setCssVar`, тему не переопределяет) |
| features | TEXT (JSON) | видимость вкладок/блоков по пресету (склад, модели, аналитика, share-ссылка) |
| archived | INTEGER | архив вместо удаления: у серверных `categories`/`product_categories` FK на `specializations` с `onDelete('cascade')` |
| template_version | INTEGER | версия применённого пресета (для «дотянуть» контент без перезаписи правок пользователя) |

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
| client_id / client_server_id | TEXT / INTEGER | клиент **необязателен**: заказ можно завести без него, синк отправляет `client_id: null` (на сервере `orders.client_id` — nullable, миграция `2026_09_19_000000`) |
| hours, minutes | INTEGER | длительность работ |
| total_amount | INTEGER | **в рублях** (единый стандарт; конверсии нет) |
| comments | TEXT | |
| user_id, user_order_number | INTEGER | |
| status | TEXT | waiting / process / done |
| paid | INTEGER | 0/1 |
| model_id / model_server_id | TEXT / INTEGER | модель техники |
| share_token | TEXT | публичная ссылка на отчёт (поле **серверное**: синк его не принимает, задача 9.4) |

### order_service (работы в ордере) — связная таблица
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | INTEGER |
| order_id / order_server_id | TEXT / INTEGER |
| service_id / service_server_id | TEXT / INTEGER |
| sale_price | REAL — рубли |
| quantity | INTEGER |

> `server_id` у связки остаётся `NULL`: у `order_service` на сервере нет своего PK. Идентичность
> строки на всех устройствах — `id` локально ↔ `uuid_id` на сервере; `insert` дедуплицируется по
> `order_id + service_id`, `delete` уходит по этому же натуральному ключу (задача 3.5).

### order_product (товары в ордере) — связная таблица (синкается с 3.4)
| колонка | тип |
|---|---|
| id | TEXT PK |
| server_id | INTEGER |
| order_id | TEXT — локальный UUID заказа |
| product_id | TEXT — локальный UUID товара |
| sale_price | INTEGER — рубли (серверное имя поля) |
| quantity | INTEGER — количество (серверное имя поля) |
| buy_price | INTEGER — себестоимость на момент продажи (задачи 9.5/9.6); `NULL` = закупка неизвестна |

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
| buy_price | INTEGER — себестоимость (задачи 9.5/9.6); вводит мастер, `NULL` = «не знаю» |

> Создана миграцией 023: заменила клиентский «справочник материалов» (миграция 018) и строки
> `order_material` (миграция 021). На сервере — таблица `materials` (`order_id, name, price, amount`),
> то есть маппинг один-в-один — **одна таблица материалов заказа на обеих сторонах** (решение D2,
> задачи 3.4/9.6). Колонка `buy_price` добавлена миграцией 024 (и серверной
> `2026_09_17_000000_add_buy_price_to_order_lines`): без неё «прибыль» в отчётах была равна выручке.

## Маржа и наценка в позициях заказа (задачи 9.5/9.6, решение D2)

Себестоимость хранится **в самой позиции** заказа — это «закупка на момент продажи»: товар мог
подорожать, и задним числом пересчитывать историю нельзя.

| позиция | выручка | себестоимость |
|---|---|---|
| `order_service` (работа) | `quantity × sale_price` | нет — это труд мастера, маржа равна цене позиции |
| `order_product` (товар со склада) | `quantity × sale_price` | `quantity × buy_price` (последняя закупка из `buy_product_prices`/прихода) |
| `materials` (ручная позиция) | `amount × price` | `amount × buy_price` (вводит мастер) |

- **маржа** = выручка − себестоимость; **наценка** = маржа / себестоимость × 100;
- `buy_price IS NULL` означает «закупка неизвестна»: строка считается с нулевой себестоимостью,
  а наценка периода/заказа не показывается (`—`), а не «0 %»;
- где взять себестоимость: клиент присылает `buy_price` в позиции (в приложении он подставляется из
  последней закупки товара, задача 9.3), а если поля нет — сервер подставляет
  `ProductRepository::lastBuyPrice()` (`buy_product_prices`, иначе последний приход).
  Для ручных позиций источника нет: её вводит мастер в форме.

Методика одна на обеих сторонах: `StatisticRepository::billedOrdersSubquery()` (сервер) и
`src/utils/analytics.js` (`orderCost`/`orderMargin`/`marginPercent`) + `src/database/queries/analytics.js`
(локальный SQL). Контрольная цифра тестов совпадает: 1700 ₽ выручки, 740 ₽ закупки → маржа 960 ₽,
наценка 130 %.

## Таблицы склада: приход, остаток, закупочная цена (задача 9.2)

> ✅ В задачах 9.2/9.3 склад подключён к офлайн-слою. Главное правило, чтобы остаток не удваивался:
> **приход** (`incoming_products`) и **закупочная цена** (`buy_product_prices`) — данные клиента
> (пишутся офлайн, уезжают очередью `operations`), а **остаток** (`product_stocks`) ведёт
> **сервер**: приход увеличивает склад ровно один раз (идемпотентность по `uuid_id`), клиент
> только забирает значение выгрузкой. **Цены продажи** (`sales_products_prices`) пишет клиент в
> момент продажи товара. Дубль «где лежит товар» (`product_stocks.product_categories_id`) удалён:
> категорию знает только `products.product_category_id`.
>
> ✅ Ранее подключённые `order_product` и ручные позиции материалов (задача **3.4**) — см. выше:
> клиентский справочник `materials` (миграция 018) и строки `order_material` (миграция 021)
> удалены миграцией **023**, данные перенесены.

### incoming_products (приход товаров на склад)
Создана миграцией 012 (дубль 016 удалён в задаче 2.1). Схема: `id, server_id, product_id,
supplier, quantity, by_price, created_at, updated_at, deleted_at`.

**Кто пишет:** `incomingProductsRepo.receiveArrival()` — офлайн, в одной транзакции с остатком и
закупочной ценой; в очередь кладётся `insert` (с `local_id` = клиентский id прихода).
**На сервере:** ветка `incoming_products` в `SyncController::insertRecord` →
`IncomingProductRepository::recordArrival()`: ключ идемпотентности — `uuid_id`, при повторе
строка только правится, а склад **не** растёт.
**UI:** «Поступление» (`ProductDialogPage` → `ArrivalProductDialogPage`); после сохранения —
уведомление с новым остатком.
✅ Имя колонки приведено к серверному: `by_price` (не `buy_price`).

### product_stocks (остаток товара на складе)
Создана миграцией 008. Схема: `id, server_id, product_id, quantity, supplier, ...` —
строка **одна на товар** (`Product::stock()` — hasOne).

**Источник истины — сервер.** Клиент делает две вещи: `productStocksRepo.applyLocalArrival()`
(оптимистично, чтобы офлайн сразу показывал новый остаток) и `applyServerRecord()` (приём
выгрузки; строка матчится по товару, поэтому «предсказанная» строка не плодит дубль).
Исходящих операций по этой таблице нет — иначе приход учёлся бы дважды.
**Владелец (сервер):** по `product_id` → `products` → `product_categories` → `specializations`.
**Вывод в UI (задача 9.3):** `StorePage` показывает остаток — `queries/products.js` джойнит
`product_stocks` и отдаёт `quantity` (вместе с закупкой и последней ценой продажи).
✅ Дубль `product_stocks.product_categories_id` удалён миграцией `2026_09_16_000000`: «где лежит
товар» знает только `products.product_category_id`, а список склада собирается из товаров.

### buy_product_prices (закупочные цены)
Создана миграцией 009. Схема: `id, server_id, product_id, buy_price, ...`.

**Кто пишет:** приход (`buyProductPricesRepo.applyLocalArrival`) — одна актуальная строка на
товар; если строка ещё не уезжала, ожидающий INSERT переписывается (payload операции
сериализуется в момент постановки). На сервере это **история** — записи применяются по `server_id`.
**Читается:** склад показывает закупку (`queries/products.js` → `buy_price`; сервер — тот же
`buy_price` в `ProductRepository::getByCategory`); маржа и наценка — задача **9.5**.

### sales_products_prices (цены продажи по заказам) — подключена в 9.3
Создана миграцией 010 (дубль 023 удалён в задаче 2.1). Схема: `id, server_id, product_id,
order_id, sale_price, ...`.

**Кто пишет:** приложение в момент продажи товара — `orderProductRepo.add()` дополнительно зовёт
`salesProductPricesRepo.add()`, а при удалении строки заказа запись снимается
(`removeByOrderAndProduct`: delete по `server_id` или отмена ещё не уехавшего INSERT). Раньше
таблицу не заполнял никто.
**Читается:** склад — «последняя цена продажи» товара (`queries/products.js` → `last_sale_price`;
сервер — `last_sale_price` в `ProductRepository::getByCategory`).
**Синк:** таблица в `syncService.repos`/`fkTransformationMap` (`order_id` → `orders`,
`product_id` → `products`), владелец проверяется сервером.

**Назначение:** фиксировать цену, по которой товар был продан в каждом заказе — для
аналитики продаж и маржи. Реализация — задача **9.3**.

> **Итог по этим таблицам:** это НЕ мусор — у каждой есть ясное назначение (приходы,
> остатки, учёт цен). Они созданы схемой, частично используются UI и сервером, но ещё не
> подключены к репозиториям/сторам/офлайн-синку. Решение задачи 2.6 — **оставить и
> задокументировать**, а подключение выполнить в задачах 9.2 и 9.3.

## Служебные таблицы

### migrations
`id TEXT PK, applied_at TEXT` — учёт применённых миграций (создаётся в boot-файле).

Версия схемы как целого хранится не в таблице, а в самой БД: `PRAGMA user_version` =
`SCHEMA_VERSION` (число миграций, `src/database/schema-version.js`). Так версия есть и у
нативного файла SQLite на Android (её же возвращает `getVersion()` плагина), и у sql.js в
браузере; сверка — в `src/database/migrate.js` (задача 4.5).

### operations (очередь синхронизации)
`id TEXT PK, type TEXT (insert|update|delete), "table" TEXT, payload TEXT (JSON),
status TEXT (pending|sending|synced|failed), attempts INTEGER, created_at INTEGER, updated_at INTEGER`.

- `status` добавлен в задаче 3.3 (миграция 022 для уже установленных БД): `dequeue` берёт
  только `pending`, in-flight операции возвращаются в работу при следующем `sync()`
  (`recoverInFlight`), так что сбой между отправкой и ответом данные не теряет;
- `created_at`/`updated_at` — миллисекунды (`Date.now()` из репозиториев).
- `attempts` и статус `failed` добавлены в Фазе 12 (миграция 028; дефект живого прогона 11.6):
  обычная ошибка сервера копит попытки (лимит 5), неисправимая (`RECORD_NOT_FOUND`,
  `FORBIDDEN_NOT_OWNER`, `MISSING_ID_FOR_UPDATE`/`_DELETE`, битый payload) «сдаётся» сразу.
  `failed`-операции больше не отправляются, видны в индикаторе синка и в «Режиме разработчика»,
  откуда их можно убрать (`discardFailedOperations`).

### meta
`key TEXT PK, value TEXT`. Курсор выдачи ведётся **на таблицу** (задача 3.6): ключ
`last_synced_at:<table>` (epoch-мс). Старый общий ключ `last_synced_at` читается как начальное
значение, если у таблицы своего курсора ещё нет — плавный апгрейд без перетягивания всего заново.
Ключ `last_backup_at` (ISO-строка) — время последнего бэкапа для автобэкапа (задача 4.4).

Запись идёт через `INSERT OR REPLACE` (ключ — PK), а не UPSERT: синтаксис
`ON CONFLICT … DO UPDATE` требует SQLite ≥ 3.24 (Android 10+), а нативный SQLite берётся из
системы (у плагина minSdk 23 → Android 6 → SQLite 3.8).

## Маппинг серверных id в FK

При отправке на сервер (local→server) syncService заменяет FK пары:
`xxx_id → xxx_server_id` (если server_id найден) либо берёт готовое `*_server_id` из payload.

При загрузке (server→local) `applyServerRecord` переводит серверные id обратно в локальные
UUID (по `findByServerId` в таблице-родителе). ⚠️ Порядок загрузки таблиц в `repos` важен:
родители (`specializations`, `categories`, `product_categories`, `clients`, `equipment_models`)
должны прийти раньше детей (`services`, `products`, `orders`, `order_service`, `order_product`,
`materials`). У `order_product`/`materials` родители — `orders` (и `products` у строк товара).

✅ Timestamps: сервер отдаёт `created_at`/`updated_at` ISO-строками (ISO-8601 UTC — оба роута
синка), а локальные колонки — целые UNIX-секунды. Все `applyServerRecord` приводят время
хелпером `src/utils/timestamps.js` (`toEpochSeconds`), поэтому сравнение «чья версия новее»
идёт в одних единицах (задача 3.8); записи, у которых время случайно оказалось в миллисекундах
(старый формат), тоже сравниваются корректно. Правило конфликтов — last-write-wins.

Сервер — источник версии: ответ `/sync` содержит `updated_at` по каждой операции, и
`operationsRepo.markSynced` применяет её к локальной записи (в секундах): у `insert` — по
локальному UUID (`local_id`), у `update`/`delete` — по `server_id` (в их payload `id` — это
серверный id). Без этого после своей отправки локальная версия оставалась «клиентской» и могла
разойтись с серверной (см. `docs/ARCHITECTURE.md` §4.2).

**Удаления (задача 3.9).** Записи, удалённые на другом устройстве, приходят в выдаче как tombstone
(`deleted: true` / `deleted_at`); `syncService._applyServerDeletion` снимает по ним «висящие»
операции (`operationsRepo.removeByLocalId`/`removeByServerId`) и удаляет строку локально — по
`server_id`, а у связок без него (`order_service`) по клиентскому `uuid_id` (локально это `id`).
Удаление заказа каскадом убирает его строки (`order_service`, `order_product`, `materials`).

**Владелец данных (задача 3.10).** `/sync` и `/sync-updates` — под `auth:sanctum`; клиент шлёт
`Authorization: Bearer <auth_token>` (токен из `localStorage`). До задачи 7.4 вход/выдача токена
не реализованы, поэтому без токена сервер отвечает `401`, операции остаются в очереди.

## Рабочие профили (мульти-специализация) и пресеты — реализовано (Фаза 10)

Решения **D4**/**D5** (`docs/PLAN.md`, `TODO.md` §Решения), задачи **10.1–10.9**. Схема под это
**уже готова**: всё навешено на `specialization_id`, синк фильтрует выдачу по владельцу
(`specializations.user_id` → `orders.user_id` → дети, задача 3.10), поэтому фаза добавляет продукт,
а не переделывает модель. Мульти-профиль («ремонт велосипедов + аквариумы» в одном аккаунте) не
требует ни новых таблиц, ни изменений синка.

**Первые четыре специализации (v1):** ремонт велосипедов (`bike`), мастер по аквариумам
(`aquarium`), установка и обслуживание кондиционеров (`hvac`), автосервис (`auto`).

**Пресет специализации** = стартовый каталог + метаданные UI. Сущности (реализовано):

| Сущность | Где живёт | Назначение |
|---|---|---|
| `specialization_templates` | сервер — источник; клиент держит read-only кэш в `meta` (`template_version`) + фолбэк на клиентские JSON | JSON-пресет: категории работ → услуги с ценами, категории товаров, модели, лексикон, `accent`, `features` |
| `template_key` у `categories` / `product_categories` / `equipment_models` | обе стороны | пометка «пришло из пресета» + ключ идемпотентности |

**Правила (чтобы не сломать офлайн и синк):**

- **клонируем, а не ссылаемся** — применённый пресет становится обычными записями мастерской, дальше
  пользователь правит их свободно;
- **идемпотентность** — повторное применение не дублирует каталог (уникальность
  `(specialization_id, template_key)`) → задача 10.4;
- **архив вместо удаления** — `specializations.archived`: физическое удаление на сервере каскадом
  снесёт `categories`/`product_categories` (FK `onDelete('cascade')`) и осиротит заказы;
- **лексикон и акцент — только представление**: словарь терминов и `setCssVar` не меняют ни одной
  таблицы;
- **схему заказа не ветвим** — максимум одно опциональное поле `equipment_identifier`
  (VIN / серийник рамы / адрес объекта), задача 10.9.

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