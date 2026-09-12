# Ledger Craft

**Система учёта работ и запчастей для мастерских** — offline-first приложение.
Один и тот же код собирается в мобильное приложение под Android (**Capacitor**)
и в веб-версию. Приложение должно работать без интернета, а при появлении сети —
синхронизироваться с сервером.

## Стек

| Слой | Технология |
|---|---|
| UI / сборка | Quasar 2 (Vue 3) + Pinia + vue-router (hash) |
| Мобильная сборка | **Capacitor** |
| Локальная БД | Android — нативный SQLite (`@capacitor-community/sqlite`), браузер — sql.js (WASM) + localStorage/IndexedDB |
| Синхронизация | собственный сервис на очереди операций (`operations`) |
| Сетевой слой | axios |
| Бэкенд | Laravel (PHP) + PostgreSQL — код в отдельном репозитории **`LedgerCraftDocker03`** (лежит рядом, общий `.code-workspace`); канонический контракт — в нём (`docs/API.md`) |

## Связанные репозитории

| Репозиторий | Что это | Где канонические доки |
|---|---|---|
| `ledger-craft-offline-first-PS` (этот) | клиент: Quasar/Vue + локальная БД | `docs/` (локальная архитектура и схема) |
| `LedgerCraftDocker03` | сервер: Laravel + PostgreSQL | `docs/API.md` (контракт API), `docs/DB.md` (схема БД) |

Оба открываются вместе через `.code-workspace`.

## Схема (упрощённо)

```
        Android (Capacitor WebView) / браузер (Quasar)
   ┌────────────────────────────────────────────┐
   │  Pages → Pinia stores → repositories       │
   │      │                           │          │
   │      ▼                           ▼          │
   │  Локальная БД              Очередь operations│
   │  (SQLite: файл на Android /                  │
   │   sql.js в браузере)                         │
   │      ▲                           │          │
   │      └───────── SyncService ◄────┘          │
   └──────────────┬─────────────────────────────┘
                  │ HTTP (axios, заголовок X-Sync-ID)
                  ▼
          Laravel API (Beget) + MySQL
```

## Быстрый старт

```bash
npm install        # или yarn
npm run dev        # разработка в браузере (http://localhost:8080)
npm run lint       # eslint
npm run format     # prettier
npm run build      # production web-сборка в dist/
```

## Мобильная сборка под Android

Локальная БД на Android — настоящий файл SQLite (`@capacitor-community/sqlite`), в браузере
остаётся sql.js. Адаптер выбирается автоматически по платформе (`Capacitor.isNativePlatform()`),
см. `docs/ARCHITECTURE.md` §4.5.

```bash
npx cap sync android                          # из src-capacitor: копирует веб-сборку и плагины
npx quasar build -m capacitor -T android      # сборка APK/AAB (нужны JDK + Android SDK)
npx quasar dev -m capacitor -T android        # запуск на устройстве/эмуляторе
```

> ⚠️ Папка `src-capacitor` в репозитории есть (манифест Capacitor + зависимости плагинов),
> но платформа Android не сгенерирована: её создают один раз на машине с JDK + Android SDK —
> `cd src-capacitor && npx cap add android`. Пока платформы нет, команды выше не выполнятся,
> а проверить работу файла БД можно только на устройстве (в этом окружении Android SDK
> недоступен). `appId` (`com.ledgercraft.app`) стоит подтвердить до первого релиза: смена
> после публикации = новое приложение в магазине.

## Документация

- `docs/PLAN.md` — **план действий (дорожная карта)**: что делать, зачем и в каком порядке
- `docs/ARCHITECTURE.md` — общая архитектура и потоки данных
- `docs/FRONTEND.md` — структура фронта, локальная БД, синхронизация
- `docs/API-INTEGRATION.md` — как клиент использует API (канонический контракт — в `LedgerCraftDocker03/docs/API.md`)
- `docs/DATA-MODEL.md` — схема таблиц **локальной** БД клиента (серверная — в `LedgerCraftDocker03/docs/DB.md`)

## Известные проблемы (кратко)

1. ~~Локальная БД **не персистится**~~ — исправлено в Фазе 1: sql.js сохраняет дамп в
   localStorage (ключ `sqljs_db`) с fallback в IndexedDB.
2. ~~WASM sql.js грузится с CDN~~ — исправлено в Фазе 1: `public/sql-wasm.wasm` +
   `locateFile: () => '/sql-wasm.wasm'`, приложение стартует без интернета.
3. ~~Связные таблицы `order_product` / ручные позиции материалов не синхронизировались~~ —
   сделано (задача 3.4): строки товаров заказа и ручные позиции (`materials`, решение D2 —
   клиентский справочник удалён, новая серверная таблица не создавалась) уезжают и приезжают
   на второе устройство. Двойной вызов `_syncLocalToServer` убран (3.1), порядок «родитель →
   ребёнок» и «дожим» отложенных операций дают граф FK + волны (3.2), очередь получила статусы
   и восстановление после сбоя (3.3). Удаление `order_service` сделано в 3.5 (delete по
   натуральному ключу), «доезд» удалений на другие устройства — в 3.9 (soft-delete + tombstones).
4. ~~В миграциях есть дубли и пропуски номеров~~ — исправлено в Фазе 2: по одной миграции на
   таблицу (номер 017 пропущен осознанно).
5. Синк работает под `auth:sanctum` (3.10), но **клиент пока не умеет логиниться**: токена нет,
   сервер отвечает `401`, операции копятся в очереди и не теряются (вход — задача 7.4).
6. Локальная БД — нативный SQLite на Android и sql.js в браузере (Фаза 4). Платформа Android
   в `src-capacitor` ещё не сгенерирована (`npx cap add android` нужен JDK + Android SDK),
   поэтому сборка APK из репозитория на чистой машине потребует одного ручного шага.

Подробности и план исправлений — в `docs/FRONTEND.md` → «Известные проблемы».
