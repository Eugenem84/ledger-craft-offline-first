// services/syncService.js

import { logger } from 'src/utils/logger'
import dbAdapter from 'src/database/db.js';
import api from 'src/services/api';
import * as metaRepo from 'src/repositories/metaRepo';
import operationsRepo from 'src/repositories/operationsRepo';
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
import * as modelsRepo from 'src/repositories/modelsRepo';

import { logAllServicesForDebugging } from 'src/repositories/servicesRepo';

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
  'orders',
  'order_service',
  'order_product',
  'materials',
];

// Паузы после сбоев доступности (backoff): 5с → 15с → 60с → 5мин (дальше — кап).
// Защищают от «бесконечного цикла отправки одного батча» (задача 3.7).
const RETRY_DELAYS_MS = [5000, 15000, 60000, 300000];

class SyncService {
  constructor() {
    this.syncing = false;

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
    };

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

    const online = this._isOnline();
    this._setStatus({ online });

    if (!online) {
      logger.log('[Sync] Нет сети — синхронизация отложена, операции останутся в очереди.');
      return;
    }

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

      this._setStatus({ syncing: false, pendingCount: await this._countPending() });

      await logAllServicesForDebugging()
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

  /**
   * Слушаем online/offline браузера: состояние для индикатора, а возвращение сети снимает
   * паузу после сбоя (сам автоповтор по событию — задача 6.3).
   */
  _bindNetworkEvents() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('online', () => {
      logger.log('[Sync] Сеть появилась');
      this._setStatus({ online: true, nextRetryAt: 0 });
    });

    window.addEventListener('offline', () => {
      logger.warn('[Sync] Сеть пропала');
      this._setStatus({ online: false });
    });
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

    return error.response.status >= 500 ? 'server' : 'request';
  }

  /**
   * Ошибка отправки: вызывающий уже вернул операции в `pending`; здесь — пауза до
   * следующей попытки. 4xx паузу не поднимает: иначе один битый payload заблокирует
   * всю очередь на минуты.
   */
  _registerFailure(kind, error) {
    const message = error?.message || String(error);

    if (kind === 'request') {
      this._setStatus({ lastError: message });
      logger.warn(`[Sync] Сервер отклонил батч (${message}). Операции останутся в очереди.`);
      return;
    }

    const failures = this.status.consecutiveFailures + 1;
    const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1];

    this._setStatus({
      consecutiveFailures: failures,
      nextRetryAt: Date.now() + delay,
      lastError: message,
    });

    logger.warn(
      `[Sync] Сбой ${kind === 'network' ? 'сети' : 'сервера'} (${failures} подряд). ` +
      `Следующая попытка через ${Math.round(delay / 1000)} с.`
    );
  }

  /** Успешный обмен с сервером: снимаем паузу и счётчик сбоев. */
  _registerSuccess() {
    if (!this.status.consecutiveFailures && !this.status.lastError) return;

    this._setStatus({ consecutiveFailures: 0, nextRetryAt: 0, lastError: null });
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

    for (let wave = 1; wave <= MAX_SYNC_WAVES; wave++) {
      const pending = (await operationsRepo.dequeue()).filter(op => !answered.has(op.id));

      if (!pending.length) {
        logger.log('[Sync] Локальная очередь пуста.');
        break;
      }

      logger.log(`[Sync] Волна ${wave}: в очереди ${pending.length} операций.`);

      const { prepared, deferred, dependencyGraph } = await this._prepareOperations(pending);

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
  }

  /**
   * Парсит payload'ы операций, применяет «сигнальные» `*_server_id`-поля и
   * проверяет, разрешимы ли внешние ключи.
   *
   * @returns {Promise<{prepared: Array, deferred: Array, dependencyGraph: Map}>}
   *   prepared — операции, готовые к отправке;
   *   deferred — операции с неготовой зависимостью (остаются в очереди);
   *   dependencyGraph — «id операции → id её родителей (в этом же батче)».
   */
  async _prepareOperations(pending) {
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
        console.error('[SyncService] Ошибка отправки операции. Она останется в очереди.', {
          operation: op,
          error: new Error(`Сервер вернул ошибку для операции: ${errorResult.error}`),
        });

        // Возвращаем в pending: повторим в следующем sync(), не в этой волне.
        await operationsRepo.markPending([op.id]);
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
   */
  async _syncServerToLocal() {
    for (const table of Object.keys(this.repos)) {
      const repo = this.repos[table];

      try {
        const since = await metaRepo.getLastSyncedAt(table);

        const response = await api.fetchUpdates({
          table,
          since
        });

        const records = Array.isArray(response) ? response : (Array.isArray(response?.records) ? response.records : []);

        let maxRecordMs = 0;

        for (const record of records) {
          maxRecordMs = Math.max(maxRecordMs, toEpochMs(record.updated_at, 0));

          // Удаление, сделанное на другом устройстве (задача 3.9): сервер отдаёт
          // tombstone — soft-deleted строку (`deleted`) или запись из `sync_tombstones`.
          if (this._isDeletion(record)) {
            await this._applyServerDeletion(table, record);
            continue;
          }

          await repo.applyServerRecord(record);
        }

        // Курсор двигаем только после того, как всю выдачу таблицы разобрали.
        // Берём максимум из «нашего сейчас» и времени последней записи: если часы устройства
        // отстают от серверных, курсор всё равно не «застрянет» на уже полученных записях.
        await metaRepo.setLastSyncedAt(table, Math.max(Date.now(), maxRecordMs + 1));
      } catch (e) {
        console.error(`[Sync] Ошибка при получении обновлений для таблицы "${table}":`, e);
        // Курсор этой таблицы не двигаем: следующий sync() до-получит её изменения.
        // Не прерываем синхронизацию других таблиц.
      }
    }
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
    await metaRepo.resetLastSyncedAt();

    // Сбрасываем и состояние сети: после полного сброса ждём первой попытки без паузы.
    this._setStatus({ consecutiveFailures: 0, nextRetryAt: 0, lastError: null, pendingCount: 0 });

    logger.log('[Sync] Full reset finished');
  }

  async deleteLocalDB() {
    await dbAdapter.deleteDatabase();
  }
}

export default new SyncService();
