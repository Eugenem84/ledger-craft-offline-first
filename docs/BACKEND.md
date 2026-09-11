# Бэкенд: контракт API (реконструкция по коду фронта)

> ⚠️ **Важно:** исходники бэкенда (Laravel) в этом репозитории отсутствуют. Документ
> восстановлен **по коду фронтенда** (`src/services/api.js`, `src/services/syncService.js`,
> репозитории) и описывает фактический контракт, который использует приложение.
> Раздел «Чек-лист сверки» в конце — что проверить по исходникам Laravel.

## 1. Общие сведения

| Параметр | Значение |
|---|---|
| Хостинг | Beget (`dev.medovf2h.beget.tech`) |
| Стек (ожидаемо) | PHP + Laravel + MySQL |
| Base URL | `https://dev.medovf2h.beget.tech/api` |
| Идентификация клиента | заголовок `X-Sync-ID` (UUID, генерируется в `localStorage` на устройстве) |
| Формат данных | JSON |
| Клиент | axios (`src/services/api.js`) |

Идентификация **не является авторизацией**: сервер различает устройства по `X-Sync-ID`,
но это не пароль/токен. Публичный URL API лежит в коде напрямую
(`src/services/api.js`, константа `API_URL`).

## 2. Эндпоинты

### 2.1. `POST /api/sync` — отправка локальных изменений

Запрос (клиент → сервер):

```
POST https://dev.medovf2h.beget.tech/api/sync
Headers: Content-Type: application/json
         X-Sync-ID: <uuid устройства>
Body:
{
  "operations": [
    {
      "type": "insert",                    // insert | update | delete
      "table": "orders",                   // имя таблицы
      "payload": {
        "local_id": "<локальный UUID>",    // только для insert
        "field": "value",                  // поля записи, FK уже переведены в server_id
        ...
      }
    }
  ]
}
```

Ожидаемый ответ (сервер → клиент) — на него завязан клиент:

```json
{
  "synced": [
    {
      "type": "insert",
      "local_id": "<локальный UUID из запроса>",
      "id": 12345                          // серверный id новой записи
    }
  ],
  "errors": [
    {
      "id": "<локальный UUID или серверный id>",
      "error": "описание ошибки"
    }
  ]
}
```

Требования со стороны клиента:
- на каждый insert сервер возвращает `id` (серверный id); по нему клиент обновляет
  `server_id` локальной записи;
- операции, попавшие в `errors`, остаются в очереди и повторяются при следующем сике;
- если ответ 200 OK, но операции нет ни в `synced`, ни в `errors`, клиент считает, что
  запись «уже применена» (`already_applied`) и удаляет её из очереди;
- клиент **не** шлёт `local_id` для `update`/`delete` — там в payload поле `id`
  (серверный id).

### 2.2. `GET /api/sync-updates` — инкрементальная выгрузка изменений

```
GET https://dev.medovf2h.beget.tech/api/sync-updates?table=<table>&since=<timestamp>
Headers: X-Sync-ID: <uuid устройства>
```

Тип `since` — число **миллисекунд** (клиент хранит `last_synced_at = Date.now()`).

Ожидаемый ответ — либо массив записей, либо объект:

```json
{ "table": "clients", "count": 2, "records": [ { ...запись... } ] }
```

Клиент (`api.js`) допускает оба варианта. Поля записей ожидаются такими же, как в локальной
схеме (см. `docs/DATA-MODEL.md`), с оговорками:

- у `specializations` название приходит как `specializationName` → клиент переименовывает
  в `name` (значит, на сервере колонка называется `specialization_name`);
- id записей в ответе = серверные id (клиент пишет их в `server_id`);
- для вставки новой записи клиенту нужны поля `created_at` и `updated_at`.

### 2.3. `POST /api/order-report/{server_id}/share-link` — публичная ссылка на отчёт

```
POST https://dev.medovf2h.beget.tech/api/order-report/12345/share-link
```

Ожидаемый ответ:

```json
{ "url": "https://..." }
```

Используется в `OrderDetailsPage.vue:generateAndCopyLink` (сейчас из неимпортированной
переменной `api` — баг фронта, см. ниже).

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

## 4. Известные нестыковки (видны с фронта)

1. **`order_product` и `order_material`** отправляются клиентом с локальным UUID в
   `order_id` (нет трансформации FK) — сервер либо сохраняет «мусор», либо должен вручную
   разбирать эти таблицы. Обратная синхронизация этих таблиц отсутствует.
2. **Даты**: клиент в разных местах шлёт число (epoch ms) или ISO-строку; сервер должен
   быть терпим к обоим вариантам.
3. **Деньги**: все цены клиент хранит и передаёт в **рублях** (единый стандарт, задача 2.3).
   Конверсии копеек больше нет. На сервере — тоже рубли.
4. **`deleted_at`**: для `orders` и др. клиент требует, чтобы на сервере были колонки
   `created_at`/`deleted_at` (см. коммит cc28079); выгрузка `sync-updates` должна учитывать
   soft-delete.
5. **Одна метка `last_synced_at`** на все таблицы — сервер не должен ждать независимых
   курсоров.

## 5. Чек-лист сверки с реальным бэкендом

- [ ] Где лежит код Laravel (репозиторий / путь на Beget)?
- [ ] Реальные имена роутов, методы, middleware, обработка `X-Sync-ID`.
- [ ] Формат ответа `/api/sync` (`{ synced, errors }`? возвращает `id` для новых записей?).
- [ ] Формат `/api/sync-updates` (массив или `{records}`; что именно означает `since`).
- [ ] Хранение `X-Sync-ID`: одна база на устройство; есть ли user-scope у таблиц?
- [ ] Схемы серверных таблиц: `specialization_name` vs `name`, деньги, `deleted_at`.
- [ ] Политика конфликтов (last-write-wins по `updated_at`?).