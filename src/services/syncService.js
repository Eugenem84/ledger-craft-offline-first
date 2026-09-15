// services/syncService.js

import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js';
import api, { hasAuthToken } from 'src/services/api';
import * as metaRepo from 'src/repositories/metaRepo';
import operationsRepo from 'src/repositories/operationsRepo';
// Очередь отчётов «Сообщить об ошибке» (Фаза 14): чистится полным сбросом, но в синк
// не входит (решение D7 — отдельный транспорт).
import feedbackRepo from 'src/repositories/feedbackRepo';
import { toEpochMs } from 'src/utils/timestamps.js';

import * as clientsRepo from 'src/repositories/clientsRepo';
import * as specializationsRepo from 'src/repositories/specializationsRepo';
import * as categoriesRepo from 'src/repositories/categoriesRepo';
import * as servicesRepo from 'src/repositories/servicesRepo';
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo';
import * as productsRepo from 'src/repositories/productsRepo';
import * as ordersRepo from 'src/repositories/ordersRepo';
import * as orderServiceRepo from 'src/repositories/orderServiceRepo.js';
import * as orderProductRepo from 'src/repositories/orderProductRepo.js';
import * as materialsRepo from 'src/repositories/materialsRepo.js';
// Склад (задача 9.2): приходы и закупочные цены; остаток ведёт сервер.
import * as incomingProductsRepo from 'src/repositories/incomingProductsRepo.js';
import * as productStocksRepo from 'src/repositories/productStocksRepo.js';
import * as buyProductPricesRepo from 'src/repositories/buyProductPricesRepo.js';
// Цены продажи товаров по заказам (задача 9.3).
import * as salesProductPricesRepo from 'src/repositories/salesProductPricesRepo.js';
import * as modelsRepo from 'src/repositories/modelsRepo';

// Максимум «волн» отправки за один sync(). Сервер присваивает `server_id` только
// что вставленным записям, поэтому ребёнок, чей родитель уехал в этой же волне,
// становится готов только к следующей. Цепочки FK короткие
// (specialization → category → service, client/equipment_model → order → order_service),
// 5 волн — с запасом; ограничение защищает от зацикливания на «висячих» FK.
const MAX_SYNC_WAVES = 5;

// Статический приоритет таблиц — только тай-брейк топологической сортировки.
// Порядок «родитель → ребёнок» определяется реальными FK-зависимостями
// (`fkTransformationMap`), а не этим списком.
const TABLE_ORDER = [
  'specializations',
  'categories',
  'product_categories',
  'equipment_models',
  'clients',
  'services',
  'products',
  // Склад (задача 9.2): приходы и закупочные цены зависят от товара.
  'incoming_products',
  'buy_product_prices',
  'orders',
  'order_service',
  'order_product',
  'sales_products_prices',
  'materials',
];

// Паузы после сбоев доступности (backoff): 5с → 15с → 60с → 5мин (дальше — кап).
// Защищают от «бесконечного цикла отправки одного батча» (задача 3.7).
const RETRY_DELAYS_MS = [5000, 15000, 60000, 300000];

// Периодичность фоновой синхронизации (задача 6.1): пока приложение открыто, изменения
// «догоняются» сами, без перезапуска. Возвращение сети и ручной повтор срабатывают
// немедленно, таймер лишь страхует «тихий» простой.
const AUTO_SYNC_INTERVAL_MS = 60000;

// Максимум попыток отправки одной операции (Фаза 12). После лимита операция
// получает статус `failed` — «сдалась» — и больше не отправляется. Без этого
// любая ошибка сервера зацикливала операцию: очередь тихо копила дубли, а
// неисправимая операция висела вечно (дефект живого прогона 11.6).
const MAX_OPERATION_ATTEMPTS = 5;

// Сколько раз операцию можно отложить из-за неразрешённого FK, прежде чем признать,
// что родителя нет и не будет (дефект живого прогона 14.11 на Android).
//
// «Отложена до следующей волны» — норма для одного прохода: сервер присваивает
// `server_id` только что вставленным записям. Но если родительская операция уже
// ушла из очереди (сдалась/убрана) или запись на сервере не появилась, ребёнок
// откладывается **в каждом** синке: очередь не убывает, `POST /sync` не формируется
// (готовых операций нет), и приложение выглядит так, будто «не видит сервер» — хотя
// ответов сервера в логах нет вовсе. После лимита откладываний операция получает
// статус `blocked` с причиной в `last_error`: лог не спамится, проблема видна в
// «Режиме разработчика», а «Починить очередь» пересобирает родительские вставки.
const MAX_DEFERRALS = 3;

// Колонки локальной БД, которые не уезжают на сервер при пересборке вставки
// («Починка очереди», `_buildInsertPayloadFromRow`): `id` отправляем как `local_id`
// (по нему сервер идемпотентен), остальное — чисто локальное состояние.
const LOCAL_ONLY_COLUMNS = new Set(['id', 'server_id', 'last_sync_id', 'sync_state']);

// Неисправимые ошибки сервера: повторять бессмысленно — операция «сдаётся» сразу.
//   RECORD_NOT_FOUND      — записи нет на сервере или она принадлежит другому;
//   FORBIDDEN_NOT_OWNER   — родитель/запись чужая (задача 3.10);
//   MISSING_ID_FOR_UPDATE — в payload нет серверного id (нечего обновлять);
//   MISSING_ID_FOR_DELETE — то же для удаления.
const PERMANENT_OPERATION_ERRORS = new Set([
  'RECORD_NOT_FOUND',
  'FORBIDDEN_NOT_OWNER',
  'MISSING_ID_FOR_UPDATE',
  'MISSING_ID_FOR_DELETE',
]);

class SyncService {
  constructor() {
    this.syncing = false;

    // Фоновый запуск (задачи 6.1/6.3): идемпотентный старт + таймер периодического sync().
    this._autoSyncStarted = false;
    this._autoSyncTimer = null;
    this._autoSyncTimeout = null;
    this._autoSyncIntervalMs = AUTO_SYNC_INTERVAL_MS;

    this.repos = {
      specializations: specializationsRepo,
      categories: categoriesRepo,
      product_categories: productCategoriesRepo,
      equipment_models: modelsRepo,
      clients: clientsRepo,
      services: servicesRepo,
      products: productsRepo,
      orders: ordersRepo,
      order_service: orderServiceRepo,
      order_product: orderProductRepo,
      materials: materialsRepo,
      // Склад (задача 9.2). Таблицы в обоих направлениях:
      //   • `incoming_products`, `buy_product_prices` — клиент пишет приходом (очередь),
      //   • `product_stocks` — остаток ведёт сервер, клиент только забирает его выгрузкой.
      incoming_products: incomingProductsRepo,
      product_stocks: productStocksRepo,
      buy_product_prices: buyProductPricesRepo,
      // Цены продажи по заказам (задача 9.3) — пишет клиент вместе с товаром заказа.
      sales_products_prices: salesProductPricesRepo,
    };

    this.fkTransformationMap = {
      clients: {
        specialization_id: 'specializations'
      },
      categories: {
        specialization_id: 'specializations'
      },
      services: {
        category_id: 'categories'
      },
      product_categories: {
        specialization_id: 'specializations'
      },
      products: {
        product_category_id: 'product_categories'
      },
      orders: {
        client_id: 'clients',
        specialization_id: 'specializations',
        model_id: 'equipment_models'
      },
      order_service: {
        order_id: 'orders',
        service_id: 'services'
      },
      order_product: {
        order_id: 'orders',
        product_id: 'products'
      },
      // Ручные позиции заказа: на сервере это таблица `materials` (order_id, name, price, amount) —
      // решение D2, клиентский справочник материалов удалён (миграция 023).
      materials: {
        order_id: 'orders'
      },
      // Склад (задача 9.2): приход и закупочная цена ссылаются на товар.
      // По `product_stocks` исходящих операций нет — остаток увеличивает сервер
      // приходом (`IncomingProductRepository::recordArrival`), поэтому и FK здесь не нужен.
      incoming_products: {
        product_id: 'products'
      },
      buy_product_prices: {
        product_id: 'products'
      },
      // Цены продажи по заказам (задача 9.3): запись привязана к заказу и товару.
      sales_products_prices: {
        order_id: 'orders',
        product_id: 'products'
      },
      equipment_models: {
        specialization_id: 'specializations'
      }
    };

    // --- [DEBUG] Добавляем отладочную функцию в консоль ---
    // `import.meta.env.DEV` — как в `logger`; `typeof window` — потому что модуль
    // импортируется и вне браузера (тесты, сборка), где `window` не существует.
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
      window.debugShowServices = servicesRepo.logAllServicesForDebugging;
    }

    // Состояние для UI (задачи 6.2/6.3): доступность сети, пауза после сбоя, размер очереди.
    this.status = {
      online: true,
      syncing: false,
      lastError: null,
      consecutiveFailures: 0,
      nextRetryAt: 0,
      pendingCount: 0,
      // «Сдавшиеся» операции: лимит попыток исчерпан / ошибка неисправима (Фаза 12).
      failedCount: 0,
      // «Заблокированные»: ждут родителя, которого нет (см. MAX_DEFERRALS).
      blockedCount: 0,
      // «Нужен вход» (задача 7.4): без токена синк недоступен — индикатор это покажет.
      requiresAuth: false,
    };

    // Кэш «есть ли у таблицы колонка server_id» — нужен «примирению» записей по
    // `uuid_id` (см. `_linkLocalRowByUuid`), чтобы не делать PRAGMA на каждую запись.
    this._columnCache = new Map();

    // Привязка «возврата в приложение» — идемпотентна, как и автозапуск.
    this._resumeBound = false;

    this._listeners = new Set();
    this._bindNetworkEvents();
  }

  /**
   * Синхронизация. Повторный вызов безопасен: пока идёт проход — выходим; если сети нет
   * или действует пауза после сбоя — тоже (backoff, задача 3.7).
   *
   * @param {{force?: boolean}} [options] force — игнорировать паузу (ручной повтор из UI)
   */
  async sync(options = {}) {
    logger.log('[Sync] start');

    if (this.syncing) {
      logger.log('[Sync] already syncing');
      return;
    }

    // ⚠️ Доступность сети — только подсказка, а не запрет на попытку (дефект 14.11).
    //
    // `navigator.onLine` в Android WebView умеет «залипать» в `false`: после обновления
    // приложения или смены сети событие `online` в приостановленный WebView не приходит,
    // и приложение молчит навсегда — ни синка, ни проверки версии, ни одного запроса к
    // серверу (в логах nginx при этом пусто, и это выглядит как «сервер недоступен»).
    // Поэтому в сеть идём всегда, а состояние выводим из реального результата: успех →
    // `online: true` (`_registerSuccess`), сбой сети → `online: false` + пауза
    // (`_registerFailure`), которая и защищает от «долбёжки» недоступного сервера.
    if (!this._isOnline()) {
      logger.log('[Sync] WebView считает, что сети нет — всё равно пробуем (флаг бывает залипшим).');
    }

    // Без токена входа сервер отвечает 401 на каждый запрос (задача 7.4): не тратим
    // сеть впустую, а показываем в индикаторе «требуется вход». Операции копятся.
    if (!hasAuthToken()) {
      this._setStatus({ requiresAuth: true });
      logger.log('[Sync] Нет токена входа — синхронизация недоступна до входа в приложение.');
      return;
    }

    this._setStatus({ requiresAuth: false });

    const waitMs = this.status.nextRetryAt - Date.now();

    if (!options.force && waitMs > 0) {
      logger.log(`[Sync] Пауза после сбоя: следующая попытка через ${Math.ceil(waitMs / 1000)} с.`);
      return;
    }

    this.syncing = true;
    this._setStatus({ syncing: true });

    try {
      // Отправляем локальные операции на сервер. Порядок «родитель → ребёнок» и
      // «дожим» отложенных операций внутри одного прогона — в _syncLocalToServer()
      // (граф FK-зависимостей + топологическая сортировка, задача 3.2).
      await this._syncLocalToServer();

      await this._syncServerToLocal();
    } catch (e) {
      console.error('[SyncService] Ошибка синхронизации:', e);
    } finally {
      this.syncing = false;
      logger.log('[Sync] end');

      this._setStatus({
        syncing: false,
        pendingCount: await this._countPending(),
        failedCount: await this._countFailed(),
        blockedCount: await this._countBlocked(),
      });
    }
  }

  // --- Состояние синка для UI (задачи 6.2/6.3) ---------------------------------

  /**
   * Подписка на изменение состояния синка.
   * @param {(status: object) => void} listener
   * @returns {() => void} отписка
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Снимок состояния: `online`, `syncing`, `lastError`, `consecutiveFailures`, `nextRetryAt`, `pendingCount`. */
  getStatus() {
    return { ...this.status };
  }

  /**
   * Перечитывает размер очереди из БД и рассылает состояние подписчикам. Нужно индикатору
   * (задача 6.2) на старте: `pendingCount` нельзя взять из памяти — он живёт в таблице операций.
   * @returns {Promise<object>} актуальный снимок состояния
   */
  async refreshStatus() {
    const pendingCount = await this._countPending();
    const failedCount = await this._countFailed();
    const blockedCount = await this._countBlocked();
    this._setStatus({ pendingCount, failedCount, blockedCount, requiresAuth: !hasAuthToken() });
    return this.getStatus();
  }

  _setStatus(patch) {
    Object.assign(this.status, patch);

    for (const listener of this._listeners) {
      try {
        listener(this.getStatus());
      } catch (e) {
        console.error('[SyncService] Ошибка подписчика состояния синка:', e);
      }
    }
  }

  // --- Фоновый запуск синка (задачи 6.1/6.3) -----------------------------------

  /**
   * Включает фоновую синхронизацию (задача 6.1):
   *   • первый проход — сразу, но **не блокируя** рендер: `onMounted` в `App.vue` уже
   *     отрисовал интерфейс, а сетевые запросы стартуют следующим тиком таймера;
   *   • далее — раз в `intervalMs` (по умолчанию минута), чтобы приложение «догоняло»
   *     изменения, пока оно открыто;
   *   • возвращение сети обрабатывает `_handleOnline()` — синк не ждёт таймера (задача 6.3).
   *
   * Повторный вызов безопасен: автозапуск идемпотентен.
   *
   * @param {{intervalMs?: number}} [options] `intervalMs: 0` — без периодического таймера
   */
  startAutoSync(options = {}) {
    if (this._autoSyncStarted) return;

    this._autoSyncStarted = true;

    if (typeof options.intervalMs === 'number') {
      this._autoSyncIntervalMs = options.intervalMs;
    }

    this._scheduleBackgroundSync();

    if (this._autoSyncIntervalMs > 0 && typeof setInterval === 'function') {
      this._autoSyncTimer = setInterval(
        () => this._scheduleBackgroundSync(),
        this._autoSyncIntervalMs
      );
    }

    logger.log(
      `[Sync] Автосинхронизация включена (интервал ${Math.round(this._autoSyncIntervalMs / 1000)} с).`
    );
  }

  /** Выключает фоновую синхронизацию (таймер, запланированный первый проход и автозапуск). */
  stopAutoSync() {
    if (this._autoSyncTimer != null) {
      clearInterval(this._autoSyncTimer);
      this._autoSyncTimer = null;
    }

    if (this._autoSyncTimeout != null) {
      clearTimeout(this._autoSyncTimeout);
      this._autoSyncTimeout = null;
    }

    this._autoSyncStarted = false;
  }

  /**
   * Запускает `sync()` фоном: не `await`, потому что вызывающий (boot/UI) не должен ждать
   * сети. `sync()` сам защищён от параллельных запусков, офлайна и паузы после сбоя.
   * Хэндл таймера хранится, чтобы `stopAutoSync()` мог отменить ещё не начатый проход.
   */
  _scheduleBackgroundSync() {
    const run = () => {
      this._autoSyncTimeout = null;
      this.sync().catch(e => console.error('[SyncService] Фоновый синк упал:', e));
    };

    if (typeof setTimeout !== 'function') {
      run();
      return;
    }

    this._autoSyncTimeout = setTimeout(run, 0);
  }

  /**
   * Слушаем online/offline браузера: состояние для индикатора, возвращение сети снимает
   * паузу после сбоя и (при включённом автозапуске) сразу дожимает очередь — задача 6.3.
   *
   * Плюс подписываемся на «возврат в приложение» (`visibilitychange` в WebView и
   * `appStateChange` у Capacitor): событие `online` до приостановленного WebView может
   * не дойти, и без перепроверки на resume приложение остаётся в залипшем офлайне
   * (дефект 14.11 — «на телефоне ничего не синкается, а в логах сервера пусто»).
   */
  _bindNetworkEvents() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('online', () => {
      this._handleOnline();
    });

    window.addEventListener('offline', () => {
      this._handleOffline();
    });

    if (!this._resumeBound) {
      this._resumeBound = true;

      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void this.handleResume();
          }
        });
      }

      this._bindNativeResume();
    }
  }

  /**
   * Нативный resume (Android/iOS): `App.addListener('appStateChange')`. Импорт
   * динамический — в браузере и в тестах этот код не выполняется.
   */
  async _bindNativeResume() {
    try {
      const { Capacitor } = await import('@capacitor/core');

      if (!Capacitor || typeof Capacitor.isNativePlatform !== 'function' || !Capacitor.isNativePlatform()) {
        return;
      }

      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appStateChange', state => {
        if (state?.isActive) void this.handleResume();
      });

      this._nativeResumeHandle = handle;
    } catch (error) {
      logger.warn('[Sync] Не удалось подписаться на appStateChange:', error?.message || error);
    }
  }

  /**
   * Возврат в приложение: заново читаем состояние сети (флаг WebView мог залипнуть) и
   * сразу дожимаем очередь, не дожидаясь таймера. Безопасно вызывать всегда — `sync()`
   * сам защищён от параллельных проходов и паузы после сбоя.
   *
   * @returns {Promise<void>}
   */
  async handleResume() {
    const online = this._isOnline();

    if (this.status.online !== online) {
      logger.log(`[Sync] Возврат в приложение: сеть ${online ? 'есть' : 'нет'} — обновляю состояние.`);
      this._setStatus({ online });
    }

    // Флаг бывает залипшим в обе стороны, поэтому повторяем в сеть — результат
    // уточнит состояние (`online`), а пауза после сбоя остаётся в силе.
    await this.sync({ force: true }).catch(e =>
      console.error('[SyncService] Синк после возврата в приложение упал:', e)
    );
  }

  /**
   * Появление сети (задача 6.3): обновляем состояние и, если автозапуск включён, немедленно
   * повторяем `sync({ force: true })` — иначе отложенные офлайном операции ждали бы таймера.
   * @returns {Promise<void>}
   */
  _handleOnline() {
    logger.log('[Sync] Сеть появилась');
    this._setStatus({ online: true, nextRetryAt: 0 });

    if (!this._autoSyncStarted) return Promise.resolve();

    return this.sync({ force: true }).catch(e =>
      console.error('[SyncService] Синк после выхода в сеть упал:', e)
    );
  }

  /** Пропажа сети: индикатор (6.2) показывает «нет интернета», очередь просто копится. */
  _handleOffline() {
    logger.warn('[Sync] Сеть пропала');
    this._setStatus({ online: false });
  }

  /** Физическая доступность сети. Вне браузера (Node/тесты) считаем, что сеть есть. */
  _isOnline() {
    return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
      ? true
      : navigator.onLine;
  }

  /**
   * Классификация ошибки отправки:
   *   network — сервер не ответил (нет соединения, таймаут);
   *   server  — ответ есть, но это 5xx (сервер недоступен/сломан);
   *   request — ответ 4xx: ошибка запроса/данных, к доступности отношения не имеет.
   */
  _failureKind(error) {
    if (!error?.response) return 'network';

    // 401 — сервер отверг токен (истёк/отозван). Это не «битый payload» и не
    // доступность: синк приостанавливаем до повторного входа (задача 7.4), а сам
    // токен сбрасывает обработчик 401 в `api.js`.
    if (error.response.status === 401) return 'auth';

    return error.response.status >= 500 ? 'server' : 'request';
  }

  /**
   * Ошибка отправки: вызывающий уже вернул операции в `pending`; здесь — пауза до
   * следующей попытки. 4xx паузу не поднимает: иначе один битый payload заблокирует
   * всю очередь на минуты.
   */
  _registerFailure(kind, error) {
    const message = error?.message || String(error);

    // Токен отвергнут сервером: пауза не нужна — без токена `sync()` вообще не пойдёт
    // в сеть, пока пользователь не войдёт (задача 7.4).
    if (kind === 'auth') {
      this._setStatus({ lastError: null, requiresAuth: true });
      logger.warn('[Sync] Сервер требует вход (401). Синхронизация приостановлена до входа.');
      return;
    }

    if (kind === 'request') {
      this._setStatus({ lastError: message, online: true });
      logger.warn(`[Sync] Сервер отклонил батч (${message}). Операции останутся в очереди.`);
      return;
    }

    const failures = this.status.consecutiveFailures + 1;
    const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1];

    this._setStatus({
      consecutiveFailures: failures,
      nextRetryAt: Date.now() + delay,
      lastError: message,
      // 5xx — сервер ответил, значит связь есть; сеть считаем «нет» только если
      // ответа не было вовсе (kind === 'network').
      online: kind !== 'network',
    });

    logger.warn(
      `[Sync] Сбой ${kind === 'network' ? 'сети' : 'сервера'} (${failures} подряд). ` +
      `Следующая попытка через ${Math.round(delay / 1000)} с.`
    );
  }

  /** Успешный обмен с сервером: снимаем паузу, счётчик сбоев и «залипший» офлайн. */
  _registerSuccess() {
    if (
      !this.status.consecutiveFailures &&
      !this.status.lastError &&
      this.status.online === true &&
      !this.status.nextRetryAt
    ) {
      return;
    }

    this._setStatus({
      consecutiveFailures: 0,
      nextRetryAt: 0,
      lastError: null,
      // Ответ сервера — самый надёжный признак того, что сеть есть: снимаем
      // «нет сети», даже если WebView всё ещё считает иначе (дефект 14.11).
      online: true,
    });
    logger.log('[Sync] Связь с сервером восстановлена.');
  }

  /** Сколько операций ждёт отправки (для индикатора «есть несинхронизированное»). */
  async _countPending() {
    try {
      return await operationsRepo.countPending();
    } catch (e) {
      console.error('[SyncService] Не удалось посчитать очередь операций:', e);
      return this.status.pendingCount;
    }
  }

  /** Сколько операций «сдалось» (исчерпали попытки / неисправимая ошибка). */
  async _countFailed() {
    try {
      return await operationsRepo.countFailed();
    } catch (e) {
      console.error('[SyncService] Не удалось посчитать отброшенные операции:', e);
      return this.status.failedCount;
    }
  }

  /** Сколько операций ждёт родителя, которого нет на сервере (нужна «починка»). */
  async _countBlocked() {
    try {
      return await operationsRepo.countBlocked();
    } catch (e) {
      console.error('[SyncService] Не удалось посчитать заблокированные операции:', e);
      return this.status.blockedCount;
    }
  }

  /**
   * «Починка очереди» (дефект живого прогона 14.11, кнопка в «Режиме разработчика»).
   *
   * Зачем: операция-ребёнок ждёт `server_id` родителя, а родительская вставка из очереди
   * уже ушла (сдалась / убрана кнопкой «убрать сдавшиеся» / применилась на сервере без
   * «примирения» локальной строки). Тогда `POST /sync` перестаёт формироваться вовсе —
   * и приложение выглядит так, будто «не видит сервер», хотя сервер отвечает.
   *
   * Что делает:
   *   1. собирает операции, которые ждут родителя без `server_id` (нет ни записи на
   *      сервере, ни своей вставки в очереди);
   *   2. перечитывает эти таблицы **с нуля** (`since = 0`) — записи, приехавшие раньше
   *      курсора, обычной выдачей не вернутся, а «примирение» по `uuid_id` проставит
   *      локальный `server_id` (родитель уже на сервере — самый частый случай);
   *   3. чего на сервере нет — пересобирает `insert` из локальной строки (сервер
   *      идемпотентен по `uuid_id`, поэтому повторная отправка дублей не создаёт);
   *   4. возвращает «заблокированных» детей в работу и дожимает синк.
   *
   * @returns {Promise<{parents: number, reconciled: number, requeuedParents: number,
   *   requeuedChildren: number, blockedLeft: number}>} отчёт для панели
   */
  async repairQueue() {
    const report = {
      parents: 0,
      reconciled: 0,
      requeuedParents: 0,
      requeuedChildren: 0,
      blockedLeft: 0,
    };

    const orphans = await this._findOrphanParents(await this._collectDeferredOperations());
    report.parents = orphans.length;

    if (orphans.length) {
      const tables = [...new Set(orphans.map(item => item.parentTable))];

      logger.log(`[Sync] Починка очереди: перечитываю таблицы ${tables.join(', ')} с нуля.`);
      await this._syncServerToLocal({ tables, since: 0 });

      for (const orphan of orphans) {
        const rows = await dbAdapter.query(`SELECT server_id FROM ${orphan.parentTable} WHERE id = ?`, [
          orphan.localId,
        ]);

        if (rows.length && rows[0].server_id) {
          report.reconciled += 1;
          continue;
        }

        if (await this._requeueInsertFromRow(orphan.parentTable, orphan.localId)) {
          report.requeuedParents += 1;
        }
      }
    }

    report.requeuedChildren = await operationsRepo.requeueBlocked();

    await this.sync({ force: true });
    await this.refreshStatus();
    report.blockedLeft = this.status.blockedCount;

    logger.log('[Sync] Починка очереди завершена', report);

    return report;
  }

  /** Операции, которые не отправляются: `pending` (могут откладываться) и `blocked`. */
  async _collectDeferredOperations() {
    const [pending, blocked] = await Promise.all([
      operationsRepo.dequeue(),
      operationsRepo.listByStatus(operationsRepo.STATUS.BLOCKED),
    ]);

    return [...pending, ...blocked];
  }

  /**
   * Ищет родителей, которых ждут операции, но которых «нет»: у локальной строки пустой
   * `server_id`, на сервере записи тоже нет, и собственной вставки в очереди не осталось.
   *
   * @param {Array<object>} operations операции очереди (pending + blocked)
   * @returns {Promise<Array<{parentTable: string, localId: string}>>}
   */
  async _findOrphanParents(operations) {
    const orphans = new Map();

    for (const op of operations) {
      const transformations = this.fkTransformationMap[op.table];

      if (!transformations) continue;

      const payload = this._parsePayload(op);

      if (!payload) continue;

      for (const [fkField, parentTable] of Object.entries(transformations)) {
        const localId = payload[fkField];

        if (localId == null) continue;

        const key = `${parentTable}:${localId}`;

        if (orphans.has(key)) continue;

        const rows = await dbAdapter.query(`SELECT server_id FROM ${parentTable} WHERE id = ?`, [localId]);

        if (rows.length && rows[0].server_id) continue;

        if (await operationsRepo.hasInsertForLocalId(parentTable, localId)) continue;

        orphans.set(key, { parentTable, localId });
      }
    }

    return [...orphans.values()];
  }

  /**
   * Пересобирает вставку родителя из его локальной строки и ставит её в очередь.
   * Внешние ключи уезжают локальными UUID — их переводит `_prepareForeignKeys()`.
   *
   * @returns {Promise<boolean>} true — операция поставлена в очередь
   */
  async _requeueInsertFromRow(table, localId) {
    try {
      const row = await dbAdapter.queryOne(`SELECT * FROM ${table} WHERE id = ?`, [localId]);

      if (!row || row.server_id) return false;

      if (row.deleted_at != null) {
        logger.warn(`[Sync] Починка очереди: ${table} ${localId} удалён локально — вставку не собираю.`);
        return false;
      }

      const payload = this._buildInsertPayloadFromRow(row);

      await operationsRepo.enqueue([
        uuidv4(),
        'insert',
        table,
        JSON.stringify(payload),
        Date.now(),
      ]);

      logger.log(`[Sync] Починка очереди: пересобран insert ${table} ${localId}.`);

      return true;
    } catch (e) {
      console.error(`[Sync] Починка очереди: не удалось пересобрать insert ${table} ${localId}:`, e);

      return false;
    }
  }

  /**
   * Payload вставки из локальной строки. Служебные локальные колонки не отправляем:
   * `id` уезжает как `local_id` (по нему сервер идемпотентен), `server_id`/`last_sync_id`
   * и «сигнальные» `*_server_id` — только про локальное состояние.
   */
  _buildInsertPayloadFromRow(row) {
    const payload = {};

    for (const [column, value] of Object.entries(row)) {
      if (LOCAL_ONLY_COLUMNS.has(column) || column.endsWith('_server_id')) continue;

      payload[column] = value === undefined ? null : value;
    }

    payload.local_id = row.id;

    return payload;
  }

  /**
   * Убирает «сдавшиеся» операции из очереди и обновляет состояние.
   * Действие из «Режима разработчика»: эти операции уже не уедут сами.
   *
   * @returns {Promise<number>} сколько операций убрано
   */
  async discardFailedOperations() {
    const before = await this._countFailed();
    await operationsRepo.clearFailed();
    await this.refreshStatus();
    logger.log(`[Sync] Убрано «сдавшихся» операций: ${before}`);
    return before;
  }

  /**
   * Неисправима ли ошибка сервера: повторять бессмысленно.
   * Помимо известных кодов (см. `PERMANENT_OPERATION_ERRORS`) сюда попадают
   * структурные ошибки — битый payload, неизвестная таблица или тип операции.
   *
   * @param {string} error код ошибки из ответа `/sync`
   * @returns {boolean}
   */
  _isPermanentOperationError(error) {
    if (!error) return false;
    if (PERMANENT_OPERATION_ERRORS.has(error)) return true;

    return /Invalid operation structure|Unsupported operation type/i.test(String(error));
  }

  /**
   * Отправляет локальную очередь на сервер.
   *
   * За один вызов выполняется несколько «волн». Сервер присваивает `server_id`
   * только что вставленным записям, поэтому ребёнок, чей родитель уехал в этой же
   * волне, готов лишь к следующей. Волны повторяются, пока есть прогресс и
   * готовые операции, — так один `sync()` не оставляет «сирот» в очереди.
   *
   * Внутри волны порядок «родитель → ребёнок» задаёт топологическая сортировка
   * (`_sortByDependencies`), а операция с неготовым FK откладывается точечно —
   * остальной батч уезжает.
   */
  async _syncLocalToServer() {
    // Операции, «зависшие» в in-flight статусах после прошлого сбоя, возвращаем в работу:
    // dequeue() отдаёт только `pending`, иначе они застряли бы в очереди навсегда.
    const recovered = await operationsRepo.recoverInFlight();

    if (recovered) {
      logger.warn(`[Sync] Найдено in-flight операций после сбоя: ${recovered} (sending/synced).`);
    }

    // Операции, по которым сервер уже дал ответ в этом прогоне (успех или ошибка):
    // серверные ошибки не должны крутиться в цикле — они останутся в очереди
    // до следующего sync().
    const answered = new Set();

    // Почему отложили операцию в этом прогоне: id → текст причины. После волн
    // счётчик откладываний растёт, и «вечно ждущие родителя» уходят в `blocked`
    // (дефект 14.11), а не спамят лог каждым синком.
    const deferredReasons = new Map();

    for (let wave = 1; wave <= MAX_SYNC_WAVES; wave++) {
      const pending = (await operationsRepo.dequeue()).filter(op => !answered.has(op.id));

      if (!pending.length) {
        logger.log('[Sync] Локальная очередь пуста.');
        break;
      }

      logger.log(`[Sync] Волна ${wave}: в очереди ${pending.length} операций.`);

      const { prepared, deferred, dependencyGraph } = await this._prepareOperations(
        pending,
        deferredReasons
      );

      if (!prepared.length) {
        // Ни одна операция не готова: у всех не разрешился внешний ключ
        // (родителя нет в очереди, у родителя ещё нет server_id и т.п.).
        logger.log(`[Sync] Волна ${wave}: готовых операций нет, отложено ${deferred.length}. Ждём следующего sync().`);
        break;
      }

      const ordered = this._sortByDependencies(prepared, dependencyGraph);
      prepared.forEach(op => answered.add(op.id));

      const confirmed = await this._sendOperations(ordered);

      logger.log(`[Sync] Волна ${wave}: отправлено ${ordered.length}, подтверждено ${confirmed}, отложено ${deferred.length}.`);

      if (confirmed === 0) {
        // Прогресса нет — не крутим один и тот же батч.
        break;
      }
    }

    await this._registerDeferrals(deferredReasons);
  }

  /**
   * Отмечает отложенные за проход операции: считает, сколько синков подряд они ждут
   * родителя, и после `MAX_DEFERRALS` переводит в `blocked` с причиной в `last_error`.
   *
   * Это ключевое отличие «подождём следующую волну» от «ждём вечно»: пока операция
   * просто `pending`, `dequeue()` снова и снова отдаёт её в подготовку, `POST /sync`
   * не формируется, и приложение выглядит неработающим, хотя сервер тут ни при чём.
   *
   * @param {Map<string, string>} deferredReasons id операции → причина откладывания
   */
  async _registerDeferrals(deferredReasons) {
    if (!deferredReasons.size) return;

    for (const [id, reason] of deferredReasons) {
      try {
        const row = await operationsRepo.getById(id);

        if (!row || row.status !== operationsRepo.STATUS.PENDING) continue;

        const { count, blocked } = await operationsRepo.markDeferred(id, reason, MAX_DEFERRALS);

        if (blocked) {
          logger.warn(
            `[Sync] Операция ${row.table}/${row.type} отложена ${count} раз подряд и больше не отправляется: ${reason}. ` +
              `Очередь не убывает — запустите «Починить очередь» в «Режиме разработчика».`
          );
        }
      } catch (e) {
        console.error('[SyncService] Не удалось учесть отложенную операцию:', e);
      }
    }
  }

  /**
   * Парсит payload'ы операций, применяет «сигнальные» `*_server_id`-поля и
   * проверяет, разрешимы ли внешние ключи.
   *
   * @returns {Promise<{prepared: Array, deferred: Array, dependencyGraph: Map}>}
   *   prepared — операции, готовые к отправке;
   *   deferred — операции с неготовой зависимостью (остаются в очереди);
   *   dependencyGraph — «id операции → id её родителей (в этом же батче)».
   * @param {Map<string, string>} [deferredReasons] сюда пишем причину откладывания
   *   (нужна, чтобы после `MAX_DEFERRALS` объяснить пользователю, чего ждём)
   */
  async _prepareOperations(pending, deferredReasons = null) {
    const parsed = [];
    const prepared = [];
    const deferred = [];
    const dependencyGraph = new Map();

    for (const op of pending) {
      if (this._parsePayload(op) === null) {
        // Битый payload не удаляем — операция просто останется в очереди.
        continue;
      }
      parsed.push(op);
    }

    // Индекс INSERT-операций батча: «<таблица>:<локальный id>» → id операции.
    // Нужен, чтобы связать ребёнка с родителем, который уезжает в этом же батче.
    const parentIndex = new Map();

    for (const op of parsed) {
      dependencyGraph.set(op.id, new Set());

      if (op.type !== 'insert') continue;

      const localId = op.payload.local_id ?? op.payload.id;
      if (localId == null) continue;

      parentIndex.set(`${op.table}:${localId}`, op.id);
    }

    for (const op of parsed) {
      // Имена полей, которые на сервере называются иначе, приводим до отправки
      // (специальности — `name` → `specializationName`).
      this._adaptPayloadForServer(op)

      const dependencies = this._prepareForeignKeys(op);

      // Рёбра графа: родитель из этого же батча → операция.
      for (const dep of dependencies) {
        const parentOpId = parentIndex.get(`${dep.parentTable}:${dep.localId}`);
        if (parentOpId && parentOpId !== op.id) {
          dependencyGraph.get(op.id).add(parentOpId);
        }
      }

      // Откладываем точечно: только эту операцию, остальной батч уедет.
      let ready = true;
      for (const dep of dependencies) {
        if (!(await this._resolveFkDependency(op, dep))) {
          ready = false;

          // Причину накапливаем: у `order_service` родителей двое (заказ и работа),
          // и в панели/master-логе полезно видеть всех, кого ждём.
          const reason = `ждём на сервере ${dep.parentTable} (локальный id ${dep.localId}) — у родителя нет server_id`;
          const previous = deferredReasons?.get(op.id);

          deferredReasons?.set(op.id, previous ? `${previous}; ${reason}` : reason);
        }
      }

      if (ready) {
        prepared.push(op);
      } else {
        deferred.push(op);
      }
    }

    return { prepared, deferred, dependencyGraph };
  }

  /**
   * Разбирает payload операции из TEXT в объект.
   * @returns {object|null} null — payload битый (операцию не отправляем).
   */
  _parsePayload(op) {
    try {
      op.payload = op.payload ? JSON.parse(op.payload) : null;
      return op.payload;
    } catch (e) {
      console.error('[SyncService] Не удалось распарсить payload, операция пропущена:', op, e);
      return null;
    }
  }

  /**
   * Приводит payload операции к именам полей сервера — там, где локальная и
   * серверная схема расходятся (как `by_price`/`buy_price` в 2.1).
   *
   * `specializations`: локально поле называется `name`, на сервере —
   * `specializationName`, плюс есть обязательный `popularCounter`. Обратный
   * маппинг уже есть в `api.js` при получении выдачи. Без этого специальность
   * не уезжала вовсе: `/sync` отвечал `DATABASE_ERROR` на отсутствующие колонки
   * (найдено тестами 5.3 вместе с заглушкой очереди в `specializationsRepo`).
   *
   * @param {object} op операция с уже распарсенным payload
   * @returns {object} та же операция
   */
  _adaptPayloadForServer(op) {
    if (!op.payload) return op

    if (op.table === 'specializations') {
      if (Object.prototype.hasOwnProperty.call(op.payload, 'name')) {
        op.payload.specializationName = op.payload.name
        delete op.payload.name
      }

      if (op.type === 'insert' && op.payload.popularCounter == null) {
        op.payload.popularCounter = 0
      }
    }

    return op
  }

  /**
   * Готовит внешние ключи операции к отправке:
   *  • «сигнальное» поле (`product_category_server_id`) означает, что родитель уже
   *    на сервере: подставляем серверный id в поле-FK и убираем сигнальное поле,
   *    чтобы оно не улетело на сервер;
   *  • остальные FK (`xxx_id`) — локальные UUID, требующие перевода в server_id
   *    (это делает `_resolveFkDependency`).
   *
   * @returns {Array<{fkField: string, parentTable: string, localId: string}>}
   *   зависимости, которым ещё нужен `server_id` родителя.
   */
  _prepareForeignKeys(op) {
    const dependencies = [];
    const transformations = this.fkTransformationMap[op.table];

    if (!transformations || !op.payload) return dependencies;
    if (op.type !== 'insert' && op.type !== 'update') return dependencies;

    for (const fkField in transformations) {
      const serverFkField = fkField.replace(/_id$/, '') + '_server_id';

      if (Object.prototype.hasOwnProperty.call(op.payload, serverFkField)) {
        const serverValue = op.payload[serverFkField];

        // Сигнальное поле в payload оставаться не должно: серверу нужен только `xxx_id`.
        delete op.payload[serverFkField];

        // ⚠️ `null` в сигнальном поле — это НЕ «родитель уже на сервере», а «на момент
        // создания записи server_id родителя был неизвестен» (так делает, например,
        // productsRepo: `product_category_server_id: null`). Если принять null за готовый
        // FK, связь потеряется навсегда — поэтому идём обычным путём: переводим локальный id.
        if (serverValue != null) {
          op.payload[fkField] = serverValue;
          continue;
        }
      }

      const localId = op.payload[fkField];

      // null/undefined — связи нет.
      if (localId == null) continue;

      dependencies.push({
        fkField,
        parentTable: transformations[fkField],
        localId,
      });
    }

    return dependencies;
  }

  /**
   * Переводит локальный id родителя в его серверный id прямо в payload операции.
   * @returns {Promise<boolean>} true — FK разрешён, операцию можно отправлять.
   */
  async _resolveFkDependency(op, dep) {
    const rows = await dbAdapter.query(
      `SELECT server_id FROM ${dep.parentTable} WHERE id = ?`,
      [dep.localId]
    );

    if (rows.length > 0 && rows[0].server_id) {
      op.payload[dep.fkField] = rows[0].server_id;
      return true;
    }

    logger.warn(
      `[Sync] Нет server_id для ${dep.fkField} (локальный ID ${dep.localId}, таблица ${dep.parentTable}). ` +
      `Операция ${op.table}/${op.type} отложена до следующей волны.`
    );
    return false;
  }

  /**
   * Топологическая сортировка операций (алгоритм Кана): родители идут раньше детей.
   * Рёбра графа построены по `fkTransformationMap` и локальным id родительских
   * операций текущего батча (`dependencyGraph`: id операции → id её родителей).
   */
  _sortByDependencies(operations, dependencyGraph) {
    const byId = new Map(operations.map(op => [op.id, op]));
    const indegree = new Map(operations.map(op => [op.id, 0]));
    const children = new Map(operations.map(op => [op.id, new Set()]));

    for (const op of operations) {
      const parents = dependencyGraph.get(op.id) || new Set();

      for (const parentId of parents) {
        // Родителя может не быть в батче (уже уехал или сам отложен).
        if (!byId.has(parentId) || parentId === op.id) continue;
        if (children.get(parentId).has(op.id)) continue;

        children.get(parentId).add(op.id);
        indegree.set(op.id, indegree.get(op.id) + 1);
      }
    }

    const compare = (a, b) =>
      this._tablePriority(a.table) - this._tablePriority(b.table) ||
      (a.created_at || 0) - (b.created_at || 0) ||
      String(a.id).localeCompare(String(b.id));

    const queue = operations.filter(op => indegree.get(op.id) === 0).sort(compare);
    const ordered = [];

    while (queue.length) {
      const op = queue.shift();
      ordered.push(op);

      for (const childId of children.get(op.id)) {
        const left = indegree.get(childId) - 1;
        indegree.set(childId, left);

        if (left === 0) {
          queue.push(byId.get(childId));
          queue.sort(compare); // детерминированный порядок
        }
      }
    }

    if (ordered.length < operations.length) {
      // Цикл в зависимостях (схема к нему не располагает, но подстрахуемся):
      // дописываем оставшиеся по приоритету таблиц, чтобы они не застряли.
      logger.warn('[Sync] Цикл в зависимостях операций — остаток отправлен по приоритету таблиц.');
      const rest = operations.filter(op => !ordered.includes(op)).sort(compare);
      ordered.push(...rest);
    }

    return ordered;
  }

  /**
   * Статический приоритет таблицы — тай-брейк топологической сортировки.
   */
  _tablePriority(table) {
    const idx = TABLE_ORDER.indexOf(table);
    return idx === -1 ? TABLE_ORDER.length : idx;
  }

  /**
   * Ищет результат конкретной операции в ответе сервера.
   *
   * Сервер (`SyncController::sync`) отдаёт `{ type, local_id, server_id }`, где
   * `local_id` — это `payload.uuid_id ?? payload.local_id`, а если их нет — id
   * самой операции. Для update/delete надёжнее сверять серверный id записи.
   */
  _findSyncResult(op, synced) {
    return synced.find(item => {
      if (item.local_id != null && (item.local_id === op.payload.local_id || item.local_id === op.id)) {
        return true;
      }
      if (op.type !== 'insert' && op.payload.id != null && item.server_id === op.payload.id) {
        return true;
      }
      return false;
    });
  }

  /**
   * Отправляет батч операций и применяет ответ сервера.
   *
   * Перед сетевым запросом операции помечаются `sending` (фиксируется в БД), а при
   * сетевой/серверной ошибке возвращаются в `pending` — сбой между отправкой и
   * ответом операцию не теряет (см. operationsRepo.recoverInFlight).
   *
   * @returns {Promise<number>} сколько операций сервер подтвердил.
   */
  async _sendOperations(operations) {
    const ids = operations.map(op => op.id);

    await operationsRepo.markSending(ids);

    let serverRes;

    try {
      serverRes = await api.send({ operations });
    } catch (e) {
      console.error('[SyncService] Ошибка отправки операций. Они останутся в очереди.', e);
      // Сеть/сервер недоступны — операции снова станут pending и уедут в следующий sync().
      await operationsRepo.markPending(ids);
      this._registerFailure(this._failureKind(e), e);
      return 0;
    }

    // Ответ получен — доступность в порядке: снимаем паузу и счётчик сбоев.
    this._registerSuccess();

    const synced = Array.isArray(serverRes?.synced) ? serverRes.synced : [];
    const errors = Array.isArray(serverRes?.errors) ? serverRes.errors : [];
    let confirmed = 0;

    for (const op of operations) {
      const syncResult = this._findSyncResult(op, synced);

      if (syncResult) {
        // markSynced атомарно удаляет операцию и «примиряет» локальную запись
        // с ответом сервера (server_id для INSERT) — поэтому «дети» этой записи
        // смогут уехать уже в следующей волне текущего sync().
        await operationsRepo.markSynced(op, syncResult);
        confirmed++;
        continue;
      }

      const errorResult = errors.find(
        e => e.local_id === op.payload.local_id || e.local_id === op.id
      );

      if (errorResult) {
        // Сервер присылает `details` (message/sql/bindings) — без них отклонённую
        // операцию невозможно диагностировать: в консоли было только «DATABASE_ERROR».
        const details = errorResult.details ?? null;
        const reason = details?.message ? `: ${details.message}` : '';
        // Причина пишется и в `operations.last_error` (её видно в «Режиме разработчика»),
        // и в лог-буфер: на телефоне консоли нет, а `console.error` в буфер не попадает.
        // Раньше у «сдавшихся» операций причина не сохранялась вовсе — мастер видел
        // «failed insert · orders · попыток: 1» без ответа сервера (дефект разбора
        // 15.09.2026: массовые отказы при синке невозможно было объяснить).
        const failureText = `${errorResult.error}${reason}`;

        // Учитываем попытку (Фаза 12): неисправимую ошибку или исчерпанный лимит —
        // «сдаёмся» (status `failed`), иначе вернём в pending и повторим.
        const attempts = (Number(op.attempts) || 0) + 1;
        const permanent = this._isPermanentOperationError(errorResult.error);
        const giveUp = permanent || attempts >= MAX_OPERATION_ATTEMPTS;

        logger.error(
          `[Sync] Сервер отклонил операцию (${failureText}). ` +
            (giveUp
              ? 'Операция помечена как «сдалась» — повторять не будем.'
              : `Попытка ${attempts} из ${MAX_OPERATION_ATTEMPTS}.`),
          {
            operation: op,
            error: new Error(`Сервер вернул ошибку для операции: ${errorResult.error}`),
            details,
            attempts,
          }
        );

        await operationsRepo.registerFailure(op.id, attempts, giveUp, failureText);
        continue;
      }

      // Сервер ответил 200, но ничего не сказал про эту операцию: считать её
      // доставленной нельзя (задача 3.5). Возвращаем в pending — повторим следующим
      // sync(). Сервер подтверждает каждую операцию явно (в том числе «пустой»
      // update/delete), а повторная отправка дублей не создаёт (uuid_id/натуральный
      // ключ на сервере) и операция помечается sending до сетевого вызова.
      logger.warn('[Sync] Сервер не вернул результат для операции — она останется в очереди.', op);
      await operationsRepo.markPending([op.id]);
    }

    return confirmed;
  }

  /**
   * Забирает изменения по каждой таблице. Курсор выдачи — свой у каждой таблицы (задача 3.6):
   * упавшая таблица сохраняет свой курсор и до-получает изменения в следующий раз, остальные
   * при этом не страдают.
   *
   * @param {{tables?: string[]|null, since?: number|null}} [options] `tables` — ограничить
   *   набор таблиц, `since` — читать выдачу «с нуля» (нужно «починке очереди»: записи,
   *   приехавшие раньше курсора, обычной выдачей уже не вернутся).
   */
  async _syncServerToLocal(options = {}) {
    const tables = Array.isArray(options.tables) && options.tables.length
      ? options.tables
      : Object.keys(this.repos);

    for (const table of tables) {
      const repo = this.repos[table];

      if (!repo) continue;

      try {
        const since = options.since ?? (await metaRepo.getLastSyncedAt(table));

        const response = await api.fetchUpdates({
          table,
          since
        });

        const records = Array.isArray(response) ? response : (Array.isArray(response?.records) ? response.records : []);

        let maxRecordMs = 0;

        for (const record of records) {
          maxRecordMs = Math.max(maxRecordMs, toEpochMs(record.updated_at, 0));

          // «Примирение» до применения: если запись создана на этом устройстве
          // офлайн, её локальный `id` — это `uuid_id` на сервере. Без проставления
          // `server_id` запись приехала бы второй копией, а операции, ссылающиеся на
          // офлайн-строку, навсегда остались бы «без родителя» (дефект 14.11).
          await this._linkLocalRowByUuid(table, record);

          // Удаление, сделанное на другом устройстве (задача 3.9): сервер отдаёт
          // tombstone — soft-deleted строку (`deleted`) или запись из `sync_tombstones`.
          if (this._isDeletion(record)) {
            await this._applyServerDeletion(table, record);
            continue;
          }

          await repo.applyServerRecord(record);
        }

        // Ответ сервера получен — снимаем «нет сети», даже если WebView считает иначе.
        this._registerSuccess();

        // Курсор двигаем только после того, как всю выдачу таблицы разобрали.
        // Берём максимум из «нашего сейчас» и времени последней записи: если часы устройства
        // отстают от серверных, курсор всё равно не «застрянет» на уже полученных записях.
        if (options.since == null) {
          await metaRepo.setLastSyncedAt(table, Math.max(Date.now(), maxRecordMs + 1));
        }
      } catch (e) {
        console.error(`[Sync] Ошибка при получении обновлений для таблицы "${table}":`, e);

        // Сеть действительно недоступна: не долбим остальные таблицы — они упадут так же,
        // а пауза после сбоя (backoff) не даст «долбёжки» в следующем проходе.
        if (this._failureKind(e) === 'network') {
          this._registerFailure('network', e);
          break;
        }

        // Курсор этой таблицы не двигаем: следующий sync() до-получит её изменения.
        // Не прерываем синхронизацию других таблиц.
      }
    }
  }

  /**
   * Проставляет локальный `server_id` записи, созданной офлайн, по её `uuid_id`
   * (на сервере он лежит в колонке `uuid_id`, локально — в `id`).
   *
   * Зачем: `applyServerRecord()` в репозиториях ищет строку по `server_id`, поэтому
   * для офлайн-записи он создал бы вторую локальную копию, а исходная строка так и
   * осталась бы без `server_id` — и все её «дети» в очереди застряли бы навсегда.
   *
   * @param {string} table
   * @param {object} record запись из `/sync-updates`
   * @returns {Promise<boolean>} true — локальная строка найдена (и, если нужно, обновлена)
   */
  async _linkLocalRowByUuid(table, record) {
    if (!record?.uuid_id || record.id == null) return false;
    if (!(await this._hasServerIdColumn(table))) return false;

    try {
      const rows = await dbAdapter.query(`SELECT id, server_id FROM ${table} WHERE id = ?`, [
        record.uuid_id,
      ]);

      if (!rows.length) return false;

      if (!rows[0].server_id) {
        await dbAdapter.execute(`UPDATE ${table} SET server_id = ? WHERE id = ?`, [
          record.id,
          record.uuid_id,
        ]);

        logger.log(
          `[Sync] Примирение по uuid_id: ${table} ${record.uuid_id} → server_id ${record.id}`
        );
      }

      return true;
    } catch (e) {
      console.error(`[Sync] Не удалось примирить запись ${table} по uuid_id:`, e);
      return false;
    }
  }

  /**
   * Есть ли у локальной таблицы колонка `server_id` (у связок вида `order_service`
   * её нет — там натуральный ключ). Результат кэшируется: схема в рамках запуска
   * не меняется.
   */
  async _hasServerIdColumn(table) {
    if (!this._columnCache.has(table)) {
      try {
        const columns = await dbAdapter.query(`PRAGMA table_info(${table})`);
        this._columnCache.set(table, columns.some(column => column.name === 'server_id'));
      } catch {
        this._columnCache.set(table, false);
      }
    }

    return this._columnCache.get(table);
  }

  /**
   * Удаление ли это? Сервер помечает tombstone явным `deleted: true`, а у
   * soft-deleted строк есть `deleted_at` (задача 3.9).
   */
  _isDeletion(record) {
    return record?.deleted === true || record?.deleted_at != null;
  }

  /**
   * Применяет удаление с сервера: убирает локальную строку и снимает «висящие»
   * операции по ней — иначе удалённая запись воскресла бы следующей же отправкой
   * (задача 3.9).
   *
   * Строку ищем по `server_id` (все синкаемые записи его получают), а если его нет
   * (у `order_service`-подобных связок серверного id не существует) — по клиентскому
   * UUID: локально он лежит в `id`, на сервере — в `uuid_id`.
   */
  async _applyServerDeletion(table, record) {
    // 1. Отменяем ещё не улетевший INSERT и любые update/delete по этой записи.
    if (record.uuid_id) {
      await operationsRepo.removeByLocalId(table, record.uuid_id);
    }
    if (record.id != null) {
      await operationsRepo.removeByServerId(table, record.id);
    }

    // 2. Если удаляется заказ — убираем и его строки (работа/товары/ручные позиции):
    //    их собственные tombstones могут прийти позже или не прийти вовсе.
    if (table === 'orders' && record.id != null) {
      const localOrders = await dbAdapter.query('SELECT id FROM orders WHERE server_id = ?', [record.id]);

      if (localOrders.length) {
        for (const child of ['order_service', 'order_product', 'materials']) {
          await dbAdapter.execute(`DELETE FROM ${child} WHERE order_id = ?`, [localOrders[0].id]);
        }
      }
    }

    // 3. Убираем саму запись.
    if (record.id != null) {
      await dbAdapter.execute(`DELETE FROM ${table} WHERE server_id = ?`, [record.id]);
    }
    if (record.uuid_id) {
      await dbAdapter.execute(`DELETE FROM ${table} WHERE id = ?`, [record.uuid_id]);
    }

    logger.log(`[Sync] Применено удаление с сервера: ${table}`, record);
  }

  async fullReset() {
    logger.log('[Sync] Full reset started');
    for (const table of Object.keys(this.repos)) {
      const repo = this.repos[table];
      if (typeof repo.clearAll === 'function') {
        await repo.clearAll();
      }
    }
    // Очередь операций — это outbox, а не сущность: в `this.repos` её нет, поэтому
    // чистим явно. Иначе после смены аккаунта старые операции уедут под новым токеном.
    await operationsRepo.clearAll();
    // Очередь отчётов «Сообщить об ошибке» (Фаза 14) — по той же причине: в отчёте
    // остаётся аккаунт и профиль, чужие отчёты уезжать не должны.
    await feedbackRepo.clearAll();
    await metaRepo.resetLastSyncedAt();

    // Сбрасываем и состояние сети: после полного сброса ждём первой попытки без паузы.
    this._setStatus({ consecutiveFailures: 0, nextRetryAt: 0, lastError: null, pendingCount: 0, blockedCount: 0 });

    // Кэш «есть ли колонка server_id» тоже чистим: БД могла быть пересоздана.
    this._columnCache.clear();

    logger.log('[Sync] Full reset finished');
  }

  async deleteLocalDB() {
    await dbAdapter.deleteDatabase();
  }
}

export default new SyncService();
