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
│   ├── backupService.js          # бэкап локальной БД (задача 4.4)
│   └── feedbackService.js        # отчёты об ошибке: офлайн-первый submit() + flush() (Фаза 14)
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
│   ├── operationsRepo.js         # очередь операций (enqueue/dequeue/listAll(12.5)/markSending/markPending/markSynced/recoverInFlight)
│   ├── metaRepo.js               # last_synced_at и пр. метаданные
│   ├── clientsRepo.js
│   ├── ordersRepo.js
│   ├── servicesRepo.js
│   ├── productsRepo.js
│   ├── categoriesRepo.js
│   ├── productCategoriesRepo.js
│   ├── specializationsRepo.js    # рабочие профили + `resolveScopeKeys()`: пара ключей профиля
│   │                             #   (локальный UUID и серверный id) для фильтров каталога/склада
│   ├── modelsRepo.js             # модели техники (equipment_models)
│   ├── orderServiceRepo.js
│   ├── orderProductRepo.js       # товары в заказе (order_product)
│   ├── materialsRepo.js          # ручные позиции заказа (таблица `materials`, решение D2)
│   ├── incomingProductsRepo.js   # приходы товара + «приходуем» офлайн (9.2) и правка прихода (15.09.2026)
│   ├── productStocksRepo.js      # остаток: локально оптимистично, источник истины — сервер (9.2);
│   │                             #   правка прихода корректирует остаток на дельту (`adjustQuantity`)
│   ├── buyProductPricesRepo.js   # закупочные цены (9.2; маржа — 9.5)
│   ├── salesProductPricesRepo.js # цены продажи по заказам (9.3)
│   ├── analyticsRepo.js          # аналитика страницы: только SELECT, очередь синка не трогает (9.1)
│   ├── stockHistoryRepo.js       # история склада по товару: приходы + расходы одной лентой (правка 15.09.2026)
│   └── feedbackRepo.js           # очередь отчётов об ошибке: pending/sending/sent/failed (Фаза 14)
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
│                                 #   useAnalyticsStore (аналитика, 9.1),
│                                 #   useStockHistoryStore (история склада по товару, правка 15.09.2026)
├── components/
│   ├── SyncStatusBar.vue         # индикатор сети/синка (6.2)
│   ├── ui/                       # общие элементы дизайн-системы (см. docs/UI.md):
│   │                             #   LcPageHeader, LcSectionCard, LcStatusChip, LcEmptyState,
│   │                             #   LcFab, LcDialogShell, LcQuantityStepper, AuthShell
│   ├── store/                    # вкладка «движение товаров» (15.09.2026): StoreHistoryPanel
│   │                             #   (фильтр + список движений профиля) и StockMovementsList
│   │                             #   (строки «+ приход / − расход», общие с карточкой товара)
│   ├── order/                    # компоненты страницы заказа (8.1): OrderHeaderActions,
│                                 #   OrderPartySelectors, OrderOverviewPanel, OrderServicesPanel,
│                                 #   OrderMaterialsPanel, OrderServicesBlock, OrderMaterialsBlock,
│                                 #   OrderProductsBlock, OrderMaterialsEditor, OrderProductsEditor,
│                                 #   OrderTotals, dialogs/* (5 диалогов)
│   └── dev/                      # DeveloperPanel.vue — «Режим разработчика» (12.5, тумблер в настройках)
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
│                                 #   ArrivalProductDialogPage, EditArrivalDialogPage (правка прихода),
│                                 #   ProductCategoryDialogPage,
│                                 #   NewServiceDialogPage, NewServiceCategoryDialogPage,
│                                 #   EditServiceCategoryDialogPage, DeleteConfirmPage,
│                                 #   FeedbackDialogPage («Сообщить об ошибке», Фаза 14)
├── router/
│   ├── index.js                  # createRouter (hash-режим)
│   └── routes.js                 # маршруты (см. ниже)
├── mocks/
│   ├── clients.json              # мок-данные для USE_MOCK=true
│   └── specializations.json
└── css/ app.scss (дизайн-токены + утилиты), quasar.variables.scss (палитра)
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

Восстановление (задача 11.9) — `restoreBackup()`: читает выбранный JSON, сверяет версию схемы
с `SCHEMA_VERSION` и импортирует через нативный адаптер (`SQLiteConnection.importFromJson`,
обязательный `overwrite: true` — иначе плагин делает no-op). Это **аварийный путь без сервера**:
обычный перенос на новое устройство делается входом и синхронизацией. В браузере кнопки
восстановления нет — там бэкап `.sqlite` (только выгрузка).

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
- индикатор `src/components/SyncStatusBar.vue` живёт **только** в шапке `MainLayout.vue`
  (задача 6.2 + 14.11: плавающий вариант на карточке заказа убран — перекрывал позиции) и подписан
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
- ✅ маржа и наценка (задача **9.5**): считаются в «Аналитике» по `buy_price` позиций
  (`orderCost`/`orderMargin`/`marginPercent`); ⚠️ 15.09.2026 разобран дефект «прочерки и нули» —
  `updateOrder()` стирал себестоимость строк при правке заказа (см. `docs/DATA-MODEL.md`
  §«Маржа и наценка», регрессия `test/order-margin.test.js`);
- ✅ `/api/arrival_product` на сервере закрыт `auth:sanctum` (задача 11.7): web-версия ходит по
  сессии (`withCredentials` + `X-CSRF-TOKEN`), чужой товар → `403`; приложение эту ручку не
  использует (приход идёт синком).

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
  Сумму заказа считают геттеры стора (`servicesTotal + materialsTotal + productsTotal`), где вклад
  каждой строки — **цена × количество** (задача 14.19: у работ и товаров количество — целое ≥ 1,
  нормализация в `src/utils/quantity.js`), при обновлении — по-прежнему «удалить всё и добавить
  заново» для связных таблиц;
  `generateAndCopyLink` переехал в стор (`generateShareLink`) и работает через `apiClient`.
  Себестоимость позиций (задачи 9.5/9.6) хранится и синкается (`buy_price`), но **из карточки
  заказа убрана** (правка владельца 15.09.2026, задача 14.21): нет колонок «закупка»/«маржа»
  в строках и блока «закупка / маржа / наценка» в `OrderTotals`; в диалоге ручной позиции поле
  «Закупка» тоже убрано. Геттеры стора `costTotal`/`margin`/`markupPercent`/`hasUnknownCost`
  остались (домен-математика и тесты 9.5/9.6), а показывает маржу только «Аналитика».
- **Список заказов** (`OrdersPage`) печатает `positions_total` — сумму позиций из запроса
  (`src/database/queries/orders.js`), а не снапшот `orders.total_amount` (задача 14.20):
  снапшот писался только при сохранении заказа из карточки и расходился с ней после прихода
  строк с сервера/второго устройства.
- **StorePage / CatalogPage / OthersPage** — работают через сторы и репозитории.
  `StorePage` показывает товары категории с колонками «остаток / закупка / продажа / посл. прод.»:
  `quantity` берётся из `product_stocks`, `buy_price` — из `buy_product_prices`,
  `last_sale_price` — из `sales_products_prices` (задача 9.3; раньше `product.quantity`
  не имел источника и колонка была пустой). Тап по строке открывает карточку товара, где
  (правка владельца 15.09.2026) есть **история склада** — приходы «+» и расходы «−» одной лентой
  (`useStockHistoryStore` → `stockHistoryRepo`), а цену закупки можно задать прямо в поле
  «Цена закупки, р» (`useProductsStore.saveBuyPrice`) — раньше её задавал только приход, и без
  неё «Аналитика» не могла посчитать маржу.
- **Раздел «склад» — две вкладки (правка владельца 15.09.2026):** «товары» — прежний склад
  (категория, список, «Поступление», «+»), «движение товаров» — `StoreHistoryPanel`:
  движения **всех** товаров профиля (приходы «+» и расходы «−») с фильтром «все / приходы /
  расходы» и кнопкой «изменить» у прихода. Строки — общие с карточкой товара
  (`components/store/StockMovementsList.vue`), даты — `utils/formatDate.js`, лента ограничена
  `stockHistoryRepo.HISTORY_LIMIT` (200) и честно об этом сообщает. Правка прихода —
  `EditArrivalDialogPage` → `useProductsStore.updateArrival` → `incomingProductsRepo.updateArrival`:
  пока приход не уехал на сервер, правится всё (остаток пересчитывается на дельту,
  ожидающий INSERT в очереди переписывается), у синхронизированного прихода количество
  заблокировано — сервер остаток по приходу не пересчитывает (закупка и поставщик уезжают
  `update`). Фильтр профиля — **по двум формам ключа** (`specializationsRepo.resolveScopeKeys()`:
  локальный UUID и серверный id, см. `docs/DATA-MODEL.md` §«История склада»), а пустая лента
  показывает счётчики движений по всей базе — так Android-only дефект 15.09.2026 («в браузере
  видно, на телефоне пусто») был бы виден сразу на экране. Логика покрыта
  `test/stock-history.test.js`, контракт вкладок и окна — `test/store-movements-ui.test.js`,
  правило ключей — `test/catalog-specialization-filter.test.js`.
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
  `database/queries/analytics.js`); у работ себестоимости нет — это труд мастера. Если закупка
  периода нулевая (у позиций нет цены закупки), страница не молчит прочерком, а объясняет текстом,
  где её взять (карточка товара / «Поступление») — правка владельца 15.09.2026. Тесты:
  `test/analytics.test.js` (правила) и `test/analytics-repo.test.js` (SQL + стор) — контрольная
  цифра набора совпадает с серверным `tests/Feature/StatisticRepositoryTest.php` (1700 ₽ выручки,
  740 ₽ закупки, маржа 960 ₽, наценка 130 %); путь «склад → заказ → маржа» целиком — в
  `test/order-margin.test.js`.

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
   и сразу по событию `online`; состояние видно в компактном индикаторе `SyncStatusBar.vue`
   в шапке («нет сети» / «синхронизация…» / «ошибка синка» / «не отправлено: N»), тап по нему —
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
От него зависят: список заказов (`useOrdersStore` → `ordersRepo.getBySpecializationId`), клиенты
(`useClientsStore.load(specializationId)` → `clientsRepo.getBySpecializationId`), каталог
(`useCategoriesStore.load(specializationId)` → `categoriesRepo.getBySpecializationId`; работы — по
выбранной категории), категории товаров и модели техники (`modelsRepo.getBySpecializationId`), а
также создание заказа (`useOrderDraftStore.effectiveSpecializationId`). Фильтр **строгий**: при
выбранном профиле чужие записи не показываются. Репозитории ищут обе формы FK — локальный UUID (до
синка) и серверный id (после); у `categories` парной колонки нет, поэтому серверный id специализации
подставляется из её строки. Легаси-записи без `specialization_id` разово привязывает миграция
`029_backfill_catalog_specialization`. Если специализаций в БД ещё нет, сторы работают по прежнему
`getAll` (тот же компромисс, что в `useOrdersStore`). Маршруты и вкладки от специализации **не зависят**:
`MainLayout.vue` жёстко рисует «ордеры / склад / каталог / аналитика / другие».

**Что сделано:**

- **Лексикон терминов** (10.1) — `src/domain/lexicon.js` (+`useLexicon()`): один словарь слов (`order`, `part`, `model`, `stock`, `catalog`),
  а не подписи по месту. Масштаб: в `src/` «заказ» встречается ~86 раз, «товар» — ~42,
  «модель техники» — ~8; подписи вкладок — в `MainLayout.vue`. Папка `src/domain/` (лексикон
  и пресеты) появилась вместе с 10.1/10.4 и числится в структуре §1.
- **Акцент и «лицо» профиля** (10.2) — runtime `setCssVar` (Quasar 2) + иконка/бейдж активной
  специализации; `quasar.variables.scss` не трогаем, полный ре-скин не делаем (тёмная тема
  `dark: true` — следим за контрастом).
- **Видимость вкладок** (10.3; доработка) — флаги профиля (`features`): состав вкладок
  (`MainLayout.vue`) и блоков заказа (`модель техники`, `share-ссылка`, `товар со склада`,
  `идентификатор объекта`); прямые переходы по URL ведут на доступный раздел, а не на пустой
  экран. Пользователь настраивает разделы сам: тумблеры в карточке «разделы профиля»
  (`OthersPage.vue`, экшен стора `setFeatures`) пишут тот же JSON, что при создании профиля,
  поэтому выбор уезжает синком как обычная правка. Пояснения к флагам — `FEATURE_HINTS`
  (`src/domain/features.js`).
- **Переключатель профиля в шапке** (10.8) — вместо спрятанного селекта в «Другие»; там же
  добавление/**архивирование** (физическое удаление запрещено: у серверных
  `categories`/`product_categories` FK на `specializations` с `onDelete('cascade')`).
  Фаза 12 (12.1/12.2) ужесточила правила: новый профиль создаётся **только выбором из доступных
  ниш** (`createFromPreset` — сразу с пресетом и каталогом, как при регистрации), а переименование
  и смена пресета у существующего профиля убраны. Легаси-профили без `preset_key` пресет в UI
  не получают (см. TODO 12.2); профиль при необходимости архивируют и заводят заново.
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

## 10. Фаза 12 — полировка профилей и отладка — реализовано

Задачи **12.1–12.5** (`TODO.md`). Схему и синк не трогали — только представление.

- **Профили только из списка** (12.1/12.2) — `useSpecializationsStore.createFromPreset(presetKey)`:
  профиль создаётся сразу с `preset_key`/`accent`/`features`/`template_version` и материализованным
  каталогом (как `onboardLocal` + `applyPreset`). В «Ещё» нет свободного ввода названия,
  переименования и блока «шаблон специализации»; изменить `name`/`preset_key` у готового профиля
  нельзя. ⚠️ попутно починен `specializationsRepo.update` (слияние с текущей строкой БД).
- **Карточка заказа** (12.3) — `OrderHeaderActions.vue` показывает статус и оплату ровно одним
  органом управления (`q-btn-toggle` + кнопка «оплачено»), без дублирующих чипов сверху; чип статуса
  остался в списке заказов (`OrdersPage.vue`). Моментальная запись статуса/оплаты в просмотре
  сохранена — это быстрый рабочий сценарий, общий «Сохранить» относится к позициям.
- **Режим разработчика** (12.4/12.5; доработка) — `components/dev/DeveloperPanel.vue` подключается
  динамическим импортом (ленивый чанк) и показывается только при включённом тумблере «разработка»
  в «Ещё» (`src/utils/devMode.js`, флаг хранится в `localStorage` и переживает перезапуск).
  Панель **доступна и в боевой сборке**: на телефоне нет консоли, а логи иногда нужно снять.
  Внутри — вкладки: «логи» (буфер `logger`, фильтр по уровню, копирование и выгрузка в файл
  `services/logExport.js`), «диагностика» (окружение `API_URL`/`USE_MOCK`/платформа/версия/аккаунт,
  версия схемы, снимок синка, счётчики таблиц, «снимок для поддержки» в буфер), «очередь»
  (`operationsRepo.listAll`, «убрать сдавшихся») и «опасное» (перенесённые сюда «полный сброс» /
  «удалить локальную БД», выключение режима). Буфер логов ведётся, если `import.meta.env.DEV`
  **или** включён режим разработчика. Форматтеры — `src/utils/devInfo.js`, регрессы —
  `test/phase12-dev.test.js`.

### Дефекты живого прогона (11.6), найденные на dev

- **Счётчик вкладки «обзор»** в карточке заказа считал только `materials + products`, поэтому при
  добавлении работы оставался `0`. Теперь единый геттер `useOrderDraftStore.positionsCount`
  (работы + материалы + товары); вкладка — `` `обзор · ${positionsCount}` ``.
- **Смена аккаунта на устройстве.** Локальная БД и очередь операций общие для всех пользователей,
  а `syncService.fullReset()` очередь не чистил: после входа другим аккаунтом его операции уезжали
  под новым токеном, а курсоры синка (`meta.last_synced_at:*`) оставались от прежнего владельца —
  новый аккаунт видел только свежие записи. Теперь `fullReset()` чистит и `operations`
  (`operationsRepo.clearAll()`), а `useAuthStore` помнит владельца (`auth_owner_id`) и при **смене**
  аккаунта делает полный сброс (`_resetLocalDataIfOwnerChanged`). Повторный вход тем же аккаунтом
  офлайн-данные не трогает. Регрессы — `test/account-switch.test.js`.
- **Тумблер «показывать готовые и оплаченные»** в списке заказов (`OrdersPage.vue`) скрывал и
  неоплаченные «готовые» заказы: сравнение `order.paid === false` не срабатывало, потому что в БД
  `paid` — целое 0/1. Фильтр вынесен в чистую `src/utils/orderFilters.js` (`isOrderVisible` прячет
  только «готово И оплачено»), подпись шапки стала «показано N из M», подсказка пустого состояния —
  по факту. Регрессы — `test/orders-filter.test.js`.
- **Payload синка заказа с вычисляемыми полями.** `useOrdersStore.items` приходят из SQL с
  `c.name AS client_name, c.phone AS client_phone`, `update()` мержит их в объект, и
  `ordersRepo.update` шлёт `{...order}` — сервер отвечал `DATABASE_ERROR: column "client_name" of
  relation "orders" does not exist`, а операция оставалась в очереди навсегда (статус/оплата не
  доезжали). FE: `ordersRepo` вырезает вычисляемые поля (`toServerPayload`); BE:
  `SyncController::updateRecord` фильтрует payload по реальным колонкам (`keepKnownColumns`).
  Регрессы — `test/orders-sync-payload.test.js` и
  `SyncControllerTest::test_order_update_ignores_columns_missing_in_table`.
- **`created_at` в payload ломал UPDATE (22008).** Сервер отклонял правку заказа
  `SQLSTATE[22008] Datetime field overflow`: клиент шлёт `created_at` UNIX-секундами, а в Postgres
  это колонка `timestamp`. FE: `ordersRepo` больше не отправляет `created_at`/`updated_at`/
  `deleted_at`; BE: `SyncController::stripServerTimestamps` вырезает клиентские timestamps и в
  INSERT, и в UPDATE. Регрессы — `test/orders-sync-payload.test.js` и
  `SyncControllerTest::test_order_update_ignores_client_timestamps`.
- **Очередь больше не «висит вечно».** У операции появился `attempts` (миграция `028`, `SCHEMA_VERSION`
  = 24): обычные ошибки ретраятся до 5 попыток, неисправимые (`RECORD_NOT_FOUND`,
  `FORBIDDEN_NOT_OWNER`, `MISSING_ID_FOR_UPDATE`/`_DELETE`, битый payload) «сдаются» сразу — статус
  `failed` («сдалась»). Видно в индикаторе синка (`syncStatusView` → `failedCount`) и в «Режиме
  разработчика», где кнопка «убрать сдавшиеся» вызывает `syncService.discardFailedOperations()`.
- **Дубль кнопки «Новая работа» и «разнокалиберные» переключатели** в карточке заказа
  (13.09.2026). На вкладке «работы» одно действие рисовалось дважды: кнопка в
  `OrderServicesPanel.vue` и FAB в `OrderDetailsPage.vue` (у страницы свой `QLayout` без
  нижнего таббара, поэтому `.lc-fab` с `bottom: 76px` «висел» в отрыве от края). FAB убран —
  создание позиции осталось в панелях («Новая работа», «Добавить материал»). Переключатели
  статуса и оплаты сведены к одному компактному ряду (`OrderHeaderActions.vue`: `dense` +
  `min-height: 28px`/`font-size: 12px`), а «оплачено» стало таким же `q-btn-toggle` (одна опция
  + `clearable`), а не отдельной кнопкой со своим размером. Регрессы —
  `test/phase12-profile.test.js`.
- **Контент уезжал под системные панели Android** (13.09.2026). С `targetSdk 35` (Android 15)
  система включает edge-to-edge принудительно, а Capacitor по умолчанию отступы **не** применяет
  (`android.adjustMarginsForEdgeToEdge: "disable"`), поэтому шапка приложения оказывалась под
  статус-баром. В `src-capacitor/capacitor.config.json` включено `"auto"` (Capacitor сам
  добавляет margin = высота системных панелей; в Capacitor 8 это станет дефолтом), а тема
  `AppTheme.NoActionBar` (её ставит `BridgeActivity` до `setContentView`) получила чёрный фон
  окна/статус-бара/навигационной панели и светлые иконки — под тёмное приложение. CSS
  `env(safe-area-inset-*)` на Android для статус-бара не помогает. ⚠️ после правки нужен
  `npx cap sync android` и живая проверка на устройстве.
- **Debug и release не уживались на одном телефоне** (14.09.2026). У обоих вариантов был один
  `applicationId` (`com.ledgercraft.app`), поэтому вторая сборка конфликтовала с первой, а
  debug-подпись (`~/.android/debug.keystore`) не встаёт поверх release-ключа — установка падала с
  «Приложение не установлено» (та же грабля, что с легаси `1.1-debug.apk` на dev-VPS); смену сборок
  приходилось делать через uninstall, теряя локальную БД и очередь. Теперь у `debug` в
  `app/build.gradle` стоят `applicationIdSuffix '.debug'` и `versionNameSuffix '-debug'`, а
  `app/src/debug/res/values/strings.xml` переименовывает приложение в «ledger-craft DEV»: debug —
  **отдельный** пакет `com.ledgercraft.app.debug` со своими данными (`data/data/<package>/…`) и своим
  экраном «установка неизвестных приложений» (`ApkInstallerPlugin` → `getPackageName()`).
  Release-подпись и публикация не затронуты; самообновление APK (13.11–13.13) проверяется только
  release поверх release. Как собирать — README §«Две сборки на одном телефоне: debug и release».

## 11. Обратная связь: «Сообщить об ошибке» (Фаза 14) — реализовано

Задачи **14.1–14.7** сделаны (клиент + сервер), **14.8–14.10** — сверху; решение **D7**, контракт и
цепочка — `docs/FEEDBACK.md`. Фаза схему синка не меняет: отчёт — **отдельный** контур (своя
очередь, свой эндпоинт), потому что «полный сброс» и восстановление из бэкапа не должны его тащить,
а второе устройство владельца не должно видеть чужие отчёты.

Что появилось на клиенте:

| Файл | Роль |
|---|---|
| `src/utils/errorLog.js` | **постоянный** буфер ошибок: кольцо на 100 записей `warn`/`error`, переживает перезапуск, пишется и в проде — в отличие от буфера `utils/logger.js`, который живёт только в dev или при включённом «режиме разработчика» (12.5) |
| `src/boot/errorLog.js` | глобальные перехватчики: `window.onerror`, `window.onunhandledrejection`, `app.config.errorHandler` (Vue) |
| миграция `030_create_feedback_reports_table.js` + `src/database/queries/feedback.js` + `src/repositories/feedbackRepo.js` | локальная очередь отчётов (`pending`/`sending`/`sent`/`failed`, `attempts`, `last_error`) — по образцу `operations`/`operationsRepo` (3.3); **не** таблица синка, в `TABLE_ORDER` не входит |
| `src/utils/feedbackView.js` | чистые функции: `buildFeedbackReport`, `canSubmitFeedback`, `feedbackStatusView`; единственное место, где собирается payload контракта (§3 в `docs/FEEDBACK.md`) — данных мастерской там нет по построению |
| `src/services/feedbackService.js` | `submit()` (локально → пробует уйти → офлайн остаётся `pending`) и `flush()` (досылает вместе с синком; 401/422 → `failed`, сеть/429 → `pending`) |
| `src/pages/dialogs/FeedbackDialogPage.vue` + кнопка в `pages/OthersPage.vue` | тип, текст, «приложить диагностику», «копировать текст в буфер» (аварийный путь), состояние отправки |

Вне репозитория (инбокс, который читает агент): `npm run feedback:pull` →
`feedback/INBOX.md` + `feedback/inbox/*.md`; разбор — `feedback/DECISIONS.md`. Сырые отчёты и
дайджест — в `.gitignore` (там логи и аккаунт), в git живут только `feedback/README.md` и
`feedback/DECISIONS.md`.

Тесты фазы: `test/error-log.test.js`, `test/feedback-queue.test.js`, `test/feedback-report.test.js`,
`test/feedback-dialog.test.js` + обновление `test/migrations.test.js`.
