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
| Локальная БД | sql.js (WASM, работает в памяти; см. «Известные проблемы») |
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
   │  Локальная БД (sql.js)   Очередь operations │
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

```bash
npx quasar build -m capacitor -T android
```

> ⚠️ В этом репозитории папка `src-capacitor` отсутствует (заглушена в `.gitignore`),
> то есть сборка под Android напрямую из репозитория сейчас не воспроизводится —
> `src-capacitor` нужно генерировать (`npx quasar new capacitor`) или инициализировать
> Capacitor отдельно, чтобы получить нативные файлы проекта.

## Документация

- `docs/PLAN.md` — **план действий (дорожная карта)**: что делать, зачем и в каком порядке
- `docs/ARCHITECTURE.md` — общая архитектура и потоки данных
- `docs/FRONTEND.md` — структура фронта, локальная БД, синхронизация
- `docs/API-INTEGRATION.md` — как клиент использует API (канонический контракт — в `LedgerCraftDocker03/docs/API.md`)
- `docs/DATA-MODEL.md` — схема таблиц **локальной** БД клиента (серверная — в `LedgerCraftDocker03/docs/DB.md`)

## Известные проблемы (кратко)

1. Локальная БД **не персистится**: sql.js работает в памяти, выгрузки в постоянное
   хранилище нет — после перезапуска приложения данные теряются.
2. WASM sql.js грузится с CDN (`https://sql.js.org/dist/`) — без интернета приложение
   не стартует, хотя заявлено offline-first.
3. Синхронизация связных таблиц `order_product` / `order_material` не доработана
   (их нет в `syncService`), а `_syncLocalToServer` вызывается дважды как костыль.
4. В миграциях есть дубли и пропуски номеров (см. `docs/FRONTEND.md`).
5. Нет авторизации: идентификация — только `X-Sync-ID` из localStorage.

Подробности и план исправлений — в `docs/FRONTEND.md` → «Известные проблемы».
