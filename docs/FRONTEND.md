# Фронтенд: Ledger Craft

Фронтенд — SPA на Quasar 2 (Vue 3) + Pinia + axios. Ниже — структура каталога `src/`,
локальная БД, схема синхронизации, страницы и известные проблемы.

## 1. Структура каталога `src/`

```
src/
├── App.vue                       # корневой компонент
├── boot/
│   ├── axios.js                  # дефолтный axios Quasar ($axios/$api) — приложением не используется
│   ├── db.js                     # инициализация БД, миграции, вызов syncService.sync()
│   └── pinia.js                  # подключение Pinia
├── services/
│   ├── api.js                    # axios-клиент: baseURL, X-Sync-ID, send()/fetchUpdates()
│   └── syncService.js            # движок синхронизации (517 строк)
├── database/
│   ├── adapters/
│   │   ├── sqljs-web-adapter.js      # АКТИВНЫЙ адаптер (sql.js, в памяти)
│   │   ├── sqlite-capacitor-adapter.js # целевой адаптер под Android (Capacitor SQLite), НЕ подключён
│   │   └── storage-adapter.js        # заглушка-интерфейс + clear()
│   ├── migrations/               # 19 файлов версий схемы (001…023; старые дубли удалены в 2.1)
│   │   └── index.js              # порядок применения миграций
│   └── queries/                  # SQL-строки по сущностям (clients, orders, services, …)
├── repositories/
│   ├── operationsRepo.js         # очередь операций (enqueue/dequeue/markSending/markPending/markSynced/recoverInFlight)
│   ├── metaRepo.js               # last_synced_at и пр. метаданные
│   ├── clientsRepo.js
│   ├── ordersRepo.js
│   ├── servicesRepo.js
│   ├── productsRepo.js
│   ├── categoriesRepo.js
│   ├── productCategoriesRepo.js
│   ├── specializationsRepo.js    # ⚠️ использует dbAdapter.enqueueOperation() — заглушку!
│   ├── modelsRepo.js             # модели техники (equipment_models)
│   ├── orderServiceRepo.js
│   ├── orderProductRepo.js       # товары в заказе (order_product)
│   └── materialsRepo.js          # ручные позиции заказа (таблица `materials`, решение D2)
├── stores/                       # Pinia: useOrdersStore, useClientsStore, useCategoriesStore,
│                                 #   useServicesStore, useProductCategoriesStore,
│                                 #   useProductsStore, useSpecializationsStore, useModelsStore
│                                 #   (+ example-store.js — мусор шаблона)
├── pages/
│   ├── OrdersPage.vue            # список ордеров
│   ├── OrderDetailsPage.vue      # 1042 строки: создание/редактирование ордера + работа с услугами,
│                                 #   материалами, товарами, диалоги
│   ├── StorePage.vue             # склад
│   ├── CatalogPage.vue           # каталог товаров/работ
│   ├── AnalyticPage.vue          # аналитика
│   ├── OthersPage.vue            # «другие» (настройки сервисов и т.п.)
│   ├── IndexPage.vue             # мусор шаблона (не используется)
│   ├── ErrorNotFound.vue
│   └── dialogs/                  # NewClientDialogPage, ProductDialogPage,
│                                 #   ArrivalProductDialogPage, ProductCategoryDialogPage,
│                                 #   NewServiceDialogPage, NewServiceCategoryDialogPage,
│                                 #   EditServiceCategoryDialogPage, DeleteConfirmPage
├── router/
│   ├── index.js                  # createRouter (hash-режим)
│   └── routes.js                 # маршруты (см. ниже)
├── mocks/
│   ├── clients.json              # мок-данные для USE_MOCK=true
│   └── specializations.json
└── css/ app.scss, quasar.variables.scss
```

## 2. Маршруты

```js
/                      → redirect /orders
/orders                → OrdersPage               (список ордеров)
/orders/new            → OrderDetailsPage (name: 'new-order')
/orders/:id            → OrderDetailsPage (meta: { requiredAuth: true, hideFooter: true })
/store                 → StorePage                (склад)
/catalog               → CatalogPage              (каталог)
/analytic              → AnalyticPage             (аналитика)
/other                 → OthersPage               (другие)
/:catchAll(.*)*        → ErrorNotFound
```

> `requiredAuth: true` объявлен в `routes.js`, **но нигде не проверяется** — router guard'а нет.

## 3. Локальная БД

Работает через адаптер `sqljs-web-adapter.js`: sql.js (SQLite в WASM), БД создаётся
`new SQL.Database()` при каждом запуске **в памяти**.

- `execute(sql, params)` → `db.run(sql, params)`
- `query(sql, params)` → `db.exec(sql, params)`, строки маппятся в объекты
- `transaction(cb)` → просто `await cb()` без BEGIN/COMMIT (фейковые транзакции)
- `enqueueOperation()` → заглушка «пока пусть молчит» ⚠️
- выгрузки на диск / загрузки с диска **нет вообще** (нет `db.export()` → запись в storage)

Полный список таблиц и колонок — в `docs/DATA-MODEL.md`.

### Миграции

Механизм: boot-файл создаёт таблицу `migrations`, применяет ещё не применённые по `id`
(одноразово, порядок — по массиву в `migrations/index.js`).

**Проблемы:** (дубли миграций устранены в задаче 2.1 — по одной миграции на таблицу)

| Проблема | Где | Статус |
|---|---|---|
| `order_product` создавалась трижды | 013, ~~019~~, ~~022~~ | ✅ оставлена 013 |
| `incoming_products` дважды | 012, ~~016~~ | ✅ оставлена 012 |
| `sales_products_prices` дважды | 010, ~~023~~ (у 023 был битый id `'021_…'`) | ✅ оставлена 010 |
| нет миграции 017 | номер пропущен | допустимо |

`queries/order_product.js` и миграция 013 используют единый набор колонок `quantity`/`sale_price`
(`amount`/`price` — только SQL-алиасы для UI). См. задачу 2.2.

### Таблицы, созданные схемой, но не подключённые к синку/репозиториям

`product_stocks`, `buy_product_prices`, `sales_products_prices`, `incoming_products`,
`materials`.

Это **не мусор** — у каждой есть назначение (приходы товара, остатки склада, учёт закупочных
и продажных цен, номенклатура материалов). Часть уже используется UI/сервером (например,
приход в `ArrivalProductDialogPage.vue`), но офлайн-слой (репозитории + сторы + синк) ещё не
подключён. Подробное назначение — в `docs/DATA-MODEL.md`; реализация — задачи **9.2 / 9.3**.

## 4. Репозитории и паттерн записи

Почти все `*Repo.js` повторяют одинаковый паттерн:

```js
const id = data.id || uuidv4();
await dbAdapter.execute(queries.insert, params);          // 1. писать локально
const payload = JSON.stringify({ local_id: id, ...data });
await operationsRepo.enqueue([opId, 'insert', 'table', payload, Date.now()]); // 2. в очередь
return id;
```

Отклонения от паттерна:
- **`specializationsRepo.js`** вызывает `dbAdapter.enqueueOperation(...)`, а этот метод —
  **заглушка**: локально созданные/изменённые специализации в очередь не попадают и на
  сервер не уходят ⚠️.
- `ordersRepo.js` хранит сумму в рублях — как и все остальные репозитории (единый стандарт, см. задачу 2.3).
- `productsRepo.js` кладёт в payload и локальный, и серверный id категории
  (`product_category_id` + `product_category_server_id`) — двойной источник истины.
- `orderServiceRepo.add()` создаёт связь без проверки цены: `sale_price` и `quantity`
  передаются вручную.

## 5. Синхронизация в деталях

Полный разбор — в `docs/ARCHITECTURE.md` (§4). Кратко:

**local → server** (`_syncLocalToServer`, задачи 3.2–3.3):
- перед волнами in-flight операции возвращаются в работу (`recoverInFlight()`): `sending` →
  `pending`, `synced`+insert → `pending`, `synced`+update/delete → снимаются;
- очередь выгружается через `dequeue()`, который отдаёт только `pending`; операции, по которым
  сервер уже ответил в этом прогоне, повторно не берутся;
- FK трансформируются через `fkTransformationMap` (или через `*_server_id`-поля payload);
- граф зависимостей (родительская операция ↔ локальный id в FK) и топологическая сортировка
  (`_sortByDependencies`): родители уезжают раньше детей;
- при отсутствии `server_id` родителя откладывается **только эта** операция — остальной батч уезжает;
- внутри одного `sync()` выполняется до 5 «волн»: операция, чей родитель получил `server_id`
  в предыдущей волне, уезжает сразу, а не на следующем запуске (снят костыль из 3.1);
- батч помечается `sending` **до** сетевого вызова, а `markSynced` одной транзакцией удаляет
  операцию и проставляет локальной записи `server_id`; ошибка сети/сервера возвращает операции
  в `pending` — сбой между отправкой и ответом данные не теряет.

**server → local** (`_syncServerToLocal`):
- `GET /api/sync-updates?table=…&since=…` по каждой таблице из `repos`;
- `repo.applyServerRecord(record)`: вставка или обновление по новизне `updated_at`;
- серверные FK переводятся в локальные UUID.

**Устойчивость к сети (задача 3.7):**
- ошибки отправки классифицируются: сеть/таймаут → `network`, 5xx → `server`, 4xx → `request`;
- backoff `5с → 15с → 60с → 5мин` для `network`/`server` (4xx паузу не ставит);
- `sync()` пропускается в офлайне (`navigator.onLine`) и в паузе; ручной повтор — `sync({ force: true })`;
- состояние для индикаторов (6.2/6.3): `syncService.getStatus()` / `subscribe()`
  (`online`, `syncing`, `lastError`, `consecutiveFailures`, `nextRetryAt`, `pendingCount`).

**Что подключено в 3.4 (решение D2):**
- `order_product` — строки товаров заказа: `order_id`/`product_id` уходят серверными id,
  `sale_price`/`quantity` — как на сервере;
- ручные позиции материала (`materials`) — «купил на стороне»: `order_id, name, price, amount`;
  клиентский справочник материалов удалён (миграция 023), таблица одна на обеих сторонах.

**Пробелы:**
- `order_service` нельзя удалить с клиента: у серверной связки нет PK, ответ приходит
  с `server_id: null` → правка заказа («удалить и добавить заново») оставляет работы
  на сервере дублями (задача 3.5);
- `incoming_products` / `product_stocks` / `buy_product_prices` / `sales_products_prices`
  не подключены к офлайн-слою (задачи 9.2/9.3).

## 6. Страницы

- **OrdersPage**: список ордеров, фильтр «показывать готовые и оплаченные», статусы
  (waiting/process/done), переход в детали. Условие фильтра сомнительное:
  `(filterDone || status !== 'done') || paid === false`.
- **OrderDetailsPage** (1042 строки): и создание, и редактирование, и все диалоги внутри
  файла; подгружает услуги/материалы/товары по локальному `order_id`; сумму ордера считает
  на лету (`totalSumServices + totalSumMaterials + totalSumProducts`); при обновлении —
  «удалить всё и добавить заново» для связных таблиц; `generateAndCopyLink` вызывает
  неимпортированный `api` (переменная не определена → ошибка eslint).
- **StorePage / CatalogPage / OthersPage / AnalyticPage** — работают через сторы и
  репозитории.

## 7. Известные проблемы (полный список)

### Критические
1. **Локальная БД не персистится**: sql.js в памяти, нет `db.export()`/загрузки из
   localStorage/IndexedDB. После перезапуска приложения все данные исчезают.
2. **WASM с CDN**: `initSqlJs({ locateFile: ... sql.js.org ... })` — без интернета приложение
   не стартует.
3. **`specializationsRepo` использует `dbAdapter.enqueueOperation()`** — метод-заглушку.
   Изменения специализаций не попадают в очередь и не синхронизируются на сервер.
   ⚠️ Следствие, найденное при задаче 3.2: у специальности не появляется `server_id`
   (нет `updateServerId`, а payload insert не содержит `local_id`), поэтому записи с
   `specialization_id` (`clients`, `categories`, `product_categories`, `equipment_models`,
   `orders`) откладываются и висят в очереди — починка в 5.3.
4. **`order_product` / ручные позиции материалов** — синхронизируются с 3.4: `order_product`
   и `materials` (ручные позиции заказа) в `repos`/`fkTransformationMap` + `applyServerRecord`.
   По решению **D2** (11.09.2026) клиентский справочник `materials` (миграция 018) удалён
   (миграция 023 переносит уже заведённые позиции), новая серверная таблица `order_material`
   не создавалась. ⚠️ Осталось: удаление `order_service` (нет PK на сервере → 3.5) и
   удаления/tombstones для второго устройства (3.9).
5. **Дубли миграций** — устранены (задача 2.1): по одной миграции на таблицу (013, 012, 010).
6. **Синхронизация блокирует UI** (`await syncService.sync()` в boot-файле) и вызывается
   только при старте: приложение не «догоняет» изменения без перезапуска.

### Значимые
7. Суммы хранятся в рублях единообразно — по всему приложению (единый стандарт, задача 2.3).
8. Транзакции реальные (задача 2.4: `BEGIN`/`COMMIT`/`ROLLBACK`), `markSynced` (2.5) удаляет
   операцию из очереди и «примиряет» локальную запись в одной транзакции — статусы очереди
   добавлены в 3.3.
9. Очередь со статусами (задача 3.3): `dequeue()` берёт только `pending`, in-flight операции
   (`sending`/`synced`) восстанавливаются при следующем `sync()`, `markSynced` атомарен.
   Осталось: координация одновременных `sync()` (флаг `syncing` живёт только в памяти —
   две вкладки могут переотправить одну операцию) и серверная идемпотентность (3.5).
10. `X-Sync-ID` в `localStorage` на уровне модуля (`api.js`) — не сработает вне браузера;
    `requiredAuth` объявлен, но не проверяется; авторизации нет.
11. Публичный `API_URL` и флаг `USE_MOCK` захардкожены; нет `.env`-конфигурации.

### Косметика / гигиена
12. В `syncService.js` — зателеграфированные блоки `// #region agent log` с `fetch()` на
    `localhost:7242/7252` (отладка ИИ-агента), их нужно удалить.
13. Мусор от шаблона: `IndexPage.vue`, `EssentialLink.vue`, `MainLayout3.vue`,
    `stores/example-store.js`, файл `.cursor/debug-*.log` в git.
14. `console.log`/`console.table` по всей кодовой базе; `switchPaidStatus` с кириллической «с».
15. `npm run lint` не проходит (9 ошибок: unused vars в адаптерах, `api is not defined`
    в `OrderDetailsPage.vue:406`).
16. Опечатки/двойные источники UUID: `crypto.randomUUID()` в сторах vs `uuid.v4()` в репо.

## 8. Рекомендуемая последовательность исправлений

1. Persistence: добавить сохранение/загрузку Uint8Array `db.export()` в sqljs-адаптер
   (или перейти на `@capacitor-community/sqlite` на Android), положить WASM локально.
2. Навести порядок в миграциях (одна версия таблицы + `ALTER` для эволюции схемы).
3. Переписать sync: топологическая сортировка операций, подключить `order_product` и ручные
   позиции материалов (решение D2: справочник `materials` удаляется), убрать двойной прогон,
   затем серверная часть — savepoints, идемпотентность, удаления, владелец (задачи 3.9–3.12).
4. Вычистить debug-мусор, починить 9 ошибок lint, выделить компоненты из OrderDetailsPage.
5. Добавить `.env` (VITE_API_URL), продумать auth и неблокирующий синк + индикатор сети.