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
│   ├── migrations/               # 18 файлов версий схемы (001…021; 016/019/022/023 удалены в 2.1)
│   │   └── index.js              # порядок применения миграций
│   └── queries/                  # SQL-строки по сущностям (clients, orders, services, …)
├── repositories/
│   ├── operationsRepo.js         # очередь операций (enqueue/dequeue/markSynced/removeByLocalId)
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
│   ├── orderProductRepo.js       # НЕ подключён к синку
│   └── orderMaterialRepo.js      # НЕ подключён к синку
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

**local → server** (`_syncLocalToServer`):
- очередь выгружается целиком (`dequeue` без состояния «в работе»);
- FK трансформируются через `fkTransformationMap` (или через `*_server_id`-поля payload);
- при отсутствии `server_id` родителя операция откладывается;
- всё отправляется одним `POST /api/sync`;
- insert-ответы сохраняют `server_id` в локальную запись (`operationsRepo.markSynced`).

**server → local** (`_syncServerToLocal`):
- `GET /api/sync-updates?table=…&since=last_synced_at` по каждой из 9 таблиц;
- `repo.applyServerRecord(record)`: вставка или обновление по новизне `updated_at`;
- серверные FK переводятся в локальные UUID.

**Пробелы:**
- `order_product`, `order_material` — не в `repos` и не в `fkTransformationMap`;
  их insert улетает с локальным UUID в `order_id`, а обновления с сервера не приходят.
- `materials` не синкается вовсе, при том что `order_material` ссылается на `materials`.

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
4. **`order_product` / `order_material` не синхронизируются** ни в одну, ни в другую сторону.
5. **Дубли миграций** — устранены (задача 2.1): по одной миграции на таблицу (013, 012, 010).
6. **Синхронизация блокирует UI** (`await syncService.sync()` в boot-файле) и вызывается
   только при старте: приложение не «догоняет» изменения без перезапуска.

### Значимые
7. Суммы хранятся в рублях единообразно — по всему приложению (единый стандарт, задача 2.3).
8. Фейковые транзакции: `transaction()` в адаптере не делает BEGIN/COMMIT;
   `markSynced` удаляет операцию и обновляет запись раздельными запросами.
9. Очередь без состояния: `dequeue()` берёт всё подряд; при одновременных запусках syncing
   есть только флаг-«мьютекс» в памяти.
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
3. Переписать sync: топологическая сортировка операций, подключить
   `order_product`/`order_material`/`materials`, убрать двойной прогон.
4. Вычистить debug-мусор, починить 9 ошибок lint, выделить компоненты из OrderDetailsPage.
5. Добавить `.env` (VITE_API_URL), продумать auth и неблокирующий синк + индикатор сети.