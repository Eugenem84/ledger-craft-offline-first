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
│   ├── syncService.js            # движок синхронизации
│   ├── presetService.js          # пресеты: серверный контент + read-only кэш в `meta` (10.7)
│   └── backupService.js          # бэкап локальной БД (задача 4.4)
├── database/
│   ├── db.js                     # единая точка доступа к БД (делегат на активный адаптер, 4.3)
│   ├── migrate.js                # прогон миграций + сверка версии схемы (4.5)
│   ├── schema-version.js         # SCHEMA_VERSION — «эталон» схемы Фазы 2 (4.5)
│   ├── adapters/
│   │   ├── sqljs-web-adapter.js       # веб: sql.js (WASM) + localStorage
│   │   ├── sqlite-capacitor-adapter.js # Android: нативный SQLite (@capacitor-community/sqlite)
│   │   └── storage-adapter.js         # дамп sql.js в localStorage/IndexedDB
│   ├── migrations/               # 22 версии схемы (001…027; дубли удалены в 2.1)
│   │   └── index.js              # порядок применения миграций
│   ├── mappers/                  # именованные мапперы позиционных SQL-аргументов (8.3):
│   │   ├── orders.js             #   заказы (insert/update/fromServer)
│   │   ├── orderLines.js         #   строки заказа: order_service / order_product / materials
│   │   ├── catalog.js            #   клиенты, работы, модели (создаются из формы заказа)
│   │   └── warehouse.js          #   склад (9.2/9.3): приходы, остатки, закупочные и продажные цены
│   └── queries/                  # SQL-строки по сущностям (clients, orders, services, analytics, склад, …)
├── repositories/
│   ├── operationsRepo.js         # очередь операций (enqueue/dequeue/markSending/markPending/markSynced/recoverInFlight)
│   ├── metaRepo.js               # last_synced_at и пр. метаданные
│   ├── clientsRepo.js
│   ├── ordersRepo.js
│   ├── servicesRepo.js
│   ├── productsRepo.js
│   ├── categoriesRepo.js
│   ├── productCategoriesRepo.js
│   ├── specializationsRepo.js
│   ├── modelsRepo.js             # модели техники (equipment_models)
│   ├── orderServiceRepo.js
│   ├── orderProductRepo.js       # товары в заказе (order_product)
│   ├── materialsRepo.js          # ручные позиции заказа (таблица `materials`, решение D2)
│   ├── incomingProductsRepo.js   # приходы товара + «приходуем» офлайн (9.2)
│   ├── productStocksRepo.js      # остаток: локально оптимистично, источник истины — сервер (9.2)
│   ├── buyProductPricesRepo.js   # закупочные цены (9.2; маржа — 9.5)
│   ├── salesProductPricesRepo.js # цены продажи по заказам (9.3)
│   └── analyticsRepo.js          # аналитика страницы: только SELECT, очередь синка не трогает (9.1)
├── domain/                       # Фаза 10: лексикон, пресеты, флаги, акцент (без UI-зависимостей)
│   ├── lexicon.js                # словарь терминов по `preset_key` + useLexicon() (10.1)
│   ├── presets/                  # пресеты ниш: bike, aquarium, hvac, auto + index.js (10.4)
│   ├── presetApply.js            # идемпотентная материализация пресета через репозитории (10.4)
│   ├── features.js               # флаги видимости вкладок/блоков + useFeatures() (10.3)
│   └── theme.js                  # выбор акцентного цвета профиля (10.2)
├── stores/                       # Pinia: useOrdersStore, useOrderDraftStore (черновик заказа, 8.1/8.2),
│                                 #   useClientsStore, useCategoriesStore, useServicesStore,
│                                 #   useProductCategoriesStore, useProductsStore,
│                                 #   useSpecializationsStore, useModelsStore, useAuthStore,
│                                 #   useAnalyticsStore (аналитика, 9.1)
├── components/
│   ├── SyncStatusBar.vue         # индикатор сети/синка (6.2)
│   └── order/                    # компоненты страницы заказа (8.1): OrderHeaderActions,
│                                 #   OrderPartySelectors, OrderOverviewPanel, OrderServicesPanel,
│                                 #   OrderMaterialsPanel, OrderServicesBlock, OrderMaterialsBlock,
│                                 #   OrderProductsBlock, OrderMaterialsEditor, OrderProductsEditor,
│                                 #   OrderTotals, dialogs/* (5 диалогов)
├── pages/
│   ├── OrdersPage.vue            # список ордеров
│   ├── OrderDetailsPage.vue      # 300 строк: «клей» страницы заказа (стор + уведомления + диалоги);
│                                 #   форма разбита на `components/order/*`, данные — в useOrderDraftStore
│   ├── StorePage.vue             # склад
│   ├── CatalogPage.vue           # каталог товаров/работ
│   ├── AnalyticPage.vue          # аналитика
│   ├── OthersPage.vue            # «другие» (настройки сервисов и т.п.)
│   ├── LoginPage.vue             # вход/разблокировка по PIN (7.4)
│   ├── RegisterPage.vue          # регистрация + выбор специализаций (10.5)
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
/store                 → StorePage                (склад)   meta: { feature: 'store' }
/catalog               → CatalogPage              (каталог)
/analytic              → AnalyticPage             (аналитика) meta: { feature: 'analytics' }
/other                 → OthersPage               (другие)
/register              → RegisterPage             (регистрация, публичный; 10.5)
/:catchAll(.*)*        → ErrorNotFound
```

> `requiredAuth: true` объявлен в `routes.js`, **но нигде не проверяется** — router guard'а нет.

## 3. Локальная БД

Работа идёт **только через `src/database/db.js`** (задача 4.3) — это делегат, который
перенаправляет вызовы в активный адаптер. Адаптер выбирает `src/boot/db.js`:

| Платформа | Адаптер | Где живут данные |
|---|---|---|
| Android (Capacitor) | `adapters/sqlite-capacitor-adapter.js` | настоящий файл SQLite: `data/data/<package>/databases/ledgercraftSQLite.db` (плагин `@capacitor-community/sqlite`) |
| Браузер (Quasar SPA) | `adapters/sqljs-web-adapter.js` | sql.js (SQLite в WASM) + дамп в localStorage (ключ `sqljs_db`), при переполнении — IndexedDB |

Интерфейс адаптера: `init()`, `execute(sql, params)`, `query(sql, params)`, `queryOne()`,
`transaction(cb)` (реальные `BEGIN`/`COMMIT`/`ROLLBACK`), `deleteDatabase()`,
`enqueueOperation()` (заглушка — очередь живёт в таблице `operations`) и платформенные
методы: `getSchemaVersion()`/`setSchemaVersion()` (обёртка над `PRAGMA user_version`) и
`exportDatabaseJson()` (нативный) / `exportDatabaseBytes()` (веб) — для бэкапа (4.4).

Импорт нативного адаптера — динамический (`await import()` с литеральным путём), поэтому
Rollup выносит его в отдельный чанк: в браузере он не скачивается, а на устройстве
подгружается по требованию. Прежний вариант «путь в переменной» Vite не мог
проанализировать — на Android модуль просто не находился.

Бэкап (задача 4.4): на Android `backupService.createBackup()` выгружает БД через
`exportToJson('full')` и кладёт JSON в документы устройства (при недоступности публичной
папки — в приватную папку приложения), автоматически раз в сутки при старте; в браузере
скачивается дамп `.sqlite`. Кнопка «Создать бэкап» — в `OthersPage.vue`.

### Версия схемы (задача 4.5)

Эталон — список миграций: `SCHEMA_VERSION` в `src/database/schema-version.js`
(равен числу миграций). Отдельного `setVersion` у плагина `@capacitor-community/sqlite` 7.x
нет (он был в 4.x), поэтому версия схемы хранится в самой БД — в `PRAGMA user_version`
(её же возвращает нативный `getVersion()`). После прогона миграций `src/database/migrate.js`
сверяет число применённых миграций и `user_version` с эталоном и при расхождении записывает
эталон заново; расхождение попадает в лог ошибок.

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
- курсор выдачи — **свой у каждой таблицы** (`meta.last_synced_at:<table>`, задача 3.6): упавшая
  таблица сохраняет курсор и до-получает своё в следующий раз, остальные идут своим курсом;
  курсор не откатывается назад (учитывается время последней полученной записи);
- `repo.applyServerRecord(record)`: вставка или обновление по новизне `updated_at`;
- серверные FK переводятся в локальные UUID.

**Устойчивость к сети (задача 3.7):**
- ошибки отправки классифицируются: сеть/таймаут → `network`, 5xx → `server`, 4xx → `request`;
- backoff `5с → 15с → 60с → 5мин` для `network`/`server` (4xx паузу не ставит);
- `sync()` пропускается в офлайне (`navigator.onLine`) и в паузе; ручной повтор — `sync({ force: true })`;
- состояние для индикаторов (6.2/6.3): `syncService.getStatus()` / `subscribe()`
  (`online`, `syncing`, `lastError`, `consecutiveFailures`, `nextRetryAt`, `pendingCount`).

**Фоновая синхронизация и индикатор (Фаза 6):**
- синк больше не запускается в boot-файле: `App.vue` в `onMounted()` зовёт
  `syncService.startAutoSync()` — первый проход фоном (интерфейс уже отрисован), далее по
  таймеру (`AUTO_SYNC_INTERVAL_MS`, по умолчанию 60 с);
- выход из офлайна (`online`-событие) снимает паузу и сразу выполняет `sync({ force: true })`,
  поэтому отложенные операции уезжают сами, без ожидания таймера;
- индикатор `src/components/SyncStatusBar.vue` (в `App.vue`, виден на всех маршрутах) подписан
  на состояние синка, на старте зовёт `refreshStatus()` (размер очереди живёт в БД), а тап по
  бейджу — ручной `sync({ force: true })`; приоритет и текст состояний — в чистой функции
  `src/utils/syncStatusView.js`.

**Удаления и владелец данных (задачи 3.9/3.10):**
- удаления с сервера применяются: `deleted: true`/`deleted_at` → `syncService._applyServerDeletion`
  (снимает «висящие» операции, удаляет строку по `server_id` или `uuid_id`, для заказа — каскад
  по его строкам); «доезд» удалений на второе устройство — задача 3.9 (сервер: soft-delete по
  схеме + `sync_tombstones`);
- `/sync` и `/sync-updates` работают под `auth:sanctum`: токен берётся из `localStorage.auth_token`
  и уходит в `Authorization: Bearer` (вход/токен — задача 7.4); сервер проставляет `user_id` и
  фильтрует выдачу по владельцу.

**Конфликты и версии (задача 3.8):**
- время в одном стандарте: локально — целые UNIX-секунды, серверные ISO-8601 UTC приводятся
  `toEpochSeconds` (`src/utils/timestamps.js`) во всех `applyServerRecord`;
- правило — **last-write-wins** по `updated_at`: более старая версия не применяется
  (сравнение работает и со «старыми» локальными значениями в миллисекундах);
- ответ `/sync` несёт `updated_at` по каждой операции, и `markSynced` применяет её локально
  (`insert` — по локальному UUID, `update`/`delete` — по `server_id`), поэтому после своей
  отправки версии клиента и сервера совпадают.

**Что подключено в 3.4 (решение D2):**
- `order_product` — строки товаров заказа: `order_id`/`product_id` уходят серверными id,
  `sale_price`/`quantity` — как на сервере;
- ручные позиции материала (`materials`) — «купил на стороне»: `order_id, name, price, amount`;
  клиентский справочник материалов удалён (миграция 023), таблица одна на обеих сторонах.

**Что подключено в 9.2 (склад — приход):**
- `incoming_products` (приходы) и `buy_product_prices` (закупочные цены) ставит в очередь
  `incomingProductsRepo.receiveArrival()` — «приходуем товар» из `ArrivalProductDialogPage.vue`
  (раньше диалог стучался в `POST /arrival_product` через `boot/axios.js` с фиктивным `baseURL`
  и офлайн не работал вовсе);
- `product_stocks` (остаток) **ведёт сервер**: приход увеличивает склад ровно один раз
  (идемпотентность по `uuid_id`), клиент обновляет строку оптимистично и принимает серверное
  значение выгрузкой (`productStocksRepo.applyServerRecord`, ключ — товар). Исходящих операций
  по остатку нет — иначе двойной учёт;
- закупочная цена — одна актуальная строка на товар: незаезженный INSERT переписывается, чтобы
  на сервер ушла последняя цена, а не первая.

**Что подключено в 9.3 (цены продажи, остаток и цены в UI):**
- `sales_products_prices` — раньше таблицу не заполнял никто: запись создаётся в момент продажи
  товара (`orderProductRepo.add()` → `salesProductPricesRepo.add()`), снимается вместе со строкой
  заказа (delete по `server_id` или отмена незаезженного INSERT); таблица в синке
  (`order_id` → `orders`, `product_id` → `products`);
- склад показывает **остаток, закупку, цену продажи и последнюю продажу**: `queries/products.js`
  джойнит `product_stocks` и скалярными подзапросами достаёт `buy_price`/`last_sale_price`
  (переносимый SQL — работает и на старом SQLite в Android, и в PostgreSQL);
- дубль «где лежит товар» убран: в остатке больше нет `product_categories_id`.

**Пробелы:**
- ✅ `order_service` (задача 3.5): `server_id` у связки по-прежнему пустой (на сервере нет PK),
  поэтому идентичность строки — клиентский UUID (`id` локально ↔ `uuid_id` на сервере).
  `orderServiceRepo.remove*` ставит delete-операцию по натуральному ключу
  `order_server_id + service_server_id`, а `applyServerRecord` матчит строку по `uuid_id` —
  правка заказа больше не оставляет дублей работ на сервере;
- маржа и наценка (по закупке) — задача **9.5**: закупочная цена на складе уже видна, но
  «прибыль» в отчётах пока не считается;
- ⚠️ `/api/arrival_product` на сервере ходит без `auth` (web-версия так и вызывает) — отдельная
  задача безопасности; приложение эту ручку не использует.

## 6. Страницы

- **OrdersPage**: список ордеров, фильтр «показывать готовые и оплаченные», статусы
  (waiting/process/done), переход в детали. Условие фильтра сомнительное:
  `(filterDone || status !== 'done') || paid === false`.
- **OrderDetailsPage** (300 строк после Фазы 8): страница оставляет себе только «клей» —
  инициализацию (`useOrderDraftStore.init`), уведомления Quasar, навигацию и видимость
  диалогов. Форма разбита на компоненты `src/components/order/*` (шапка, селекторы
  клиента/модели, панели «все»/«работы»/«материалы», списки, редакторы, итоги, 5 диалогов),
  данные и запись — в сторе; прямых вызовов `*Repo` из `*.vue` больше нет (8.2).
  Кнопка share-ссылки (9.4) — `draft.generateShareLink()`: без `server_id` стор бросает
  `ORDER_NOT_SYNCED`, а причину отказа («нет интернета», «нужен вход», «ордер не найден»)
  объясняет чистая функция `src/utils/shareLinkError.js` (тест `test/share-link.test.js`).
  Сумму заказа считают геттеры стора (`servicesTotal + materialsTotal + productsTotal`),
  при обновлении — по-прежнему «удалить всё и добавить заново» для связных таблиц;
  `generateAndCopyLink` переехал в стор (`generateShareLink`) и работает через `apiClient`.
  Себестоимость позиций (задачи 9.5/9.6): в редакторах материалов/товаров есть колонка «закупка»
  (у товара она подставляется из последней закупки склада, у ручной позиции — из формы),
  у строки считается маржа, а `OrderTotals` показывает «закупка / маржа / наценка»
  (геттеры стора `costTotal`/`margin`/`markupPercent`; `hasUnknownCost` предупреждает, что в части
  позиций закупка не указана и маржа «частичная»).
- **StorePage / CatalogPage / OthersPage** — работают через сторы и репозитории.
  `StorePage` показывает товары категории с колонками «остаток / закупка / продажа / посл. прод.»:
  `quantity` берётся из `product_stocks`, `buy_price` — из `buy_product_prices`,
  `last_sale_price` — из `sales_products_prices` (задача 9.3; раньше `product.quantity`
  не имел источника и колонка была пустой).
- **AnalyticPage** (задача 9.1) — аналитика считается по **локальной** БД (офлайн-первый подход):
  `useAnalyticsStore` → `analyticsRepo` → `database/queries/analytics.js`, правила — в
  `utils/analytics.js`. Единая методика (та же, что в серверном `StatisticRepository`): учтённый
  заказ = `status = 'done'` + `paid` + не удалён, выручка = позиции (работы + товары + ручные
  материалы), период — по `orders.updated_at`, средний чек = выручка / число учтённых заказов.
  Страница показывает выручку за сегодня/неделю/месяц/год (аналог серверного DWMY), итоги
  выбранного масштаба (30 дней / 15 недель / 12 месяцев / 5 лет), колонки периодов, распределение
  по статусам («что сейчас в работе») и топы работ/товаров/материалов. С задач 9.5/9.6 в итогах
  периода и в топах товаров/материалов есть **себестоимость, маржа и наценка**
  (`orderCost`/`orderMargin`/`marginPercent` в `utils/analytics.js`, `*_cost`/`margin` в
  `database/queries/analytics.js`); у работ себестоимости нет — это труд мастера. Тесты:
  `test/analytics.test.js` (правила) и `test/analytics-repo.test.js` (SQL + стор) — контрольная
  цифра набора совпадает с серверным `tests/Feature/StatisticRepositoryTest.php` (1700 ₽ выручки,
  740 ₽ закупки, маржа 960 ₽, наценка 130 %).

## 7. Известные проблемы (полный список)

### Критические
1. ~~**Локальная БД не персистится**~~ — исправлено в Фазе 1: sql.js сохраняет дамп
   (`db.export()`) в localStorage (ключ `sqljs_db`) с fallback в IndexedDB, а на Android
   Фаза 4 включила настоящий файл SQLite на диске.
2. ~~**WASM с CDN**~~ — исправлено в Фазе 1: `public/sql-wasm.wasm` +
   `locateFile: () => '/sql-wasm.wasm'`, приложение стартует без интернета.
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
   не создавалась. ✅ Удаление `order_service` сделано в 3.5 (delete по `order_id + service_id`,
   строки матчатся по `uuid_id`). ⚠️ Осталось: удаления/tombstones для второго устройства (3.9).
5. **Дубли миграций** — устранены (задача 2.1): по одной миграции на таблицу (013, 012, 010).
6. ~~**Синхронизация блокирует UI** (`await syncService.sync()` в boot-файле) и вызывается
   только при старте~~ — исправлено в Фазе 6 (6.1/6.2/6.3): boot-файл только готовит БД, синк
   стартует фоном из `App.vue` после монтирования (`startAutoSync()`), повторяется по таймеру
   и сразу по событию `online`; состояние видно в индикаторе `SyncStatusBar.vue` («нет
   интернета» / «синхронизация…» / «ошибка синка» / «не отправлено: N»), тап по нему —
   ручной `sync({ force: true })`.

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
4. Вычистить debug-мусор, починить 9 ошибок lint (сделано в Фазе 0), выделить компоненты из
   OrderDetailsPage (Фаза 8: страница 300 строк + `components/order/*`, данные — в
   `useOrderDraftStore`, позиционные SQL-параметры — в `database/mappers/*`).

## 9. Рабочие профили (мульти-специализация) и адаптация UI — реализовано (Фаза 10)

Решения **D4**/**D5**, задачи **10.1–10.9** (`docs/PLAN.md`, `TODO.md` §Решения). Схему это не
меняет — меняется только представление. Статус: сделано (лексикон, пресеты, онбординг,
переключатель профиля, акцент, видимость вкладок, поля профиля, `equipment_identifier`).

**Что уже есть в UI.** Единственное место, где специализация видна пользователю, — селект
«Выберите специализацию» в `pages/OthersPage.vue` (пишет в `useSpecializationsStore.selectedId`).
От него зависят: список заказов (`useOrdersStore` → `ordersRepo.getBySpecializationId`), клиенты,
каталог (`categories`/`services`), категории товаров и модели техники, а также создание заказа
(`useOrderDraftStore.effectiveSpecializationId`). Маршруты и вкладки от специализации **не зависят**:
`MainLayout.vue` жёстко рисует «ордеры / склад / каталог / аналитика / другие».

**Что сделано:**

- **Лексикон терминов** (10.1) — `src/domain/lexicon.js` (+`useLexicon()`): один словарь слов (`order`, `part`, `model`, `stock`, `catalog`),
  а не подписи по месту. Масштаб: в `src/` «заказ» встречается ~86 раз, «товар» — ~42,
  «модель техники» — ~8; подписи вкладок — в `MainLayout.vue`. Папка `src/domain/` (лексикон
  и пресеты) появилась вместе с 10.1/10.4 и числится в структуре §1.
- **Акцент и «лицо» профиля** (10.2) — runtime `setCssVar` (Quasar 2) + иконка/бейдж активной
  специализации; `quasar.variables.scss` не трогаем, полный ре-скин не делаем (тёмная тема
  `dark: true` — следим за контрастом).
- **Видимость вкладок** (10.3) — флаги пресета (`features`); прямые переходы по URL ведут на
  доступный раздел, а не на пустой экран.
- **Переключатель профиля в шапке** (10.8) — вместо спрятанного селекта в «Другие»; там же
  добавление/переименование/**архивирование** (физическое удаление запрещено: у серверных
  `categories`/`product_categories` FK на `specializations` с `onDelete('cascade')`).
- **Онбординг** (10.4/10.5) — экран «Начать с шаблона» и регистрация с выбором 1..N специализаций.
  ✅ Сделано: `pages/RegisterPage.vue` (публичный `/register`), `AuthController::register`
  создаёт специализации и возвращает их, клиент материализует пресеты.
- **Поля профиля** (10.6) — `preset_key`, `accent`, `features`, `archived`, `template_version`
  (локальная миграция `024_*` + серверная миграция). Если оставить их локальными, они не переживут
  `fullReset` и не приедут на второе устройство.

**Почему это не переделка.** Ось специализации уже сквозная: на сервере `User hasMany Specialization`
(`specializations.user_id`), на клиенте всё привязано к `specialization_id`, синк фильтрует выдачу
по владельцу (3.10). Фаза 10 — надстройка, а не рефакторинг (детали — `docs/DATA-MODEL.md`,
раздел «Рабочие профили…»).
5. Добавить `.env` (VITE_API_URL), продумать auth и неблокирующий синк + индикатор сети.