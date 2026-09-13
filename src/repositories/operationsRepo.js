// repositories/operationsRepo.js
//
// Очередь операций для синхронизации (outbox).
//
// У операции есть статус:
//   pending — ждёт отправки (её и забирает dequeue);
//   sending — отправлена, ответ сервера ещё не разобран;
//   synced  — сервер подтвердил операцию, идёт «примирение» локальной записи;
//   failed  — «сдалась»: исчерпан лимит попыток или сервер ответил неисправимой
//             ошибкой (чужой/удалённый заказ и т.п.). Больше не отправляется,
//             видна в индикаторе/«Режиме разработчика» и убирается оттуда вручную.
//
// Сбой между отправкой и ответом операцию не теряет: она остаётся в очереди
// в статусе sending/synced, а следующий sync() возвращает её в работу
// (recoverInFlight). См. docs/ARCHITECTURE.md §4.1.
import db from 'src/database/db.js';
import { toEpochSeconds } from 'src/utils/timestamps.js'

const STATUS = {
  PENDING: 'pending',
  SENDING: 'sending',
  SYNCED: 'synced',
  FAILED: 'failed',
};

/**
 * Связки без собственного PK: сервер не возвращает `server_id`, но локально
 * нужно запомнить серверные id родителей — по ним `orderServiceRepo.remove`
 * ставит delete по натуральному ключу (задача 3.5). Без этого удаление работы
 * на устройстве-авторе не доезжало до сервера: строка оставалась там навсегда
 * (найдено тестами 5.4).
 */
const RECONCILE_PARENT_IDS = {
  order_service: { order_server_id: 'order_id', service_server_id: 'service_id' },
};

export default {
  STATUS,

  /**
   * Добавляет операцию в очередь на синхронизацию (статус — pending).
   * @param {Array} params - Порядок полей как у вызывающих: [id, type, table, payload, created_at]
   */
  async enqueue(params) {
    const [id, type, table, payload, createdAt] = params;

    await db.execute(
      `INSERT INTO operations (id, type, "table", payload, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, type, table, payload, STATUS.PENDING, createdAt, Date.now()]
    );
  },

  /**
   * Отдаёт операции, ждущие отправки. Операции в статусах sending/synced не
   * отдаются: по ним сетевой вызов уже был (или идёт).
   */
  async dequeue() {
    return db.query(
      `SELECT * FROM operations WHERE status = ? ORDER BY created_at ASC`,
      [STATUS.PENDING]
    );
  },

  /**
   * Помечает операции отправленными (in-flight). Вызывается ДО сетевого запроса,
   * чтобы падение приложения между отправкой и ответом не потеряло операцию.
   * @param {Array<string>} ids
   */
  /**
   * Сколько операций ждёт отправки (для индикатора «есть несинхронизированное» в UI).
   */
  async countPending() {
    const rows = await db.query(
      `SELECT COUNT(*) AS count FROM operations WHERE status = ?`,
      [STATUS.PENDING]
    );
    return rows.length ? rows[0].count : 0;
  },

  /**
   * Вся очередь операций в порядке постановки (задача 12.5).
   *
   * `dequeue()` отдаёт только `pending`, а отладочной панели нужно видеть и
   * in-flight (`sending`/`synced`) записи, поэтому читаем без фильтра.
   *
   * @returns {Promise<Array<object>>}
   */
  async listAll() {
    return db.query('SELECT * FROM operations ORDER BY created_at ASC');
  },

  /**
   * Полная очистка очереди операций.
   *
   * Нужна `syncService.fullReset()`: раньше сброс чистил только таблицы сущностей,
   * а очередь оставалась — после смены аккаунта её операции уезжали на сервер под
   * новым токеном. `operations` — outbox, а не сущность, поэтому в `this.repos`
   * синка её нет и вызывается эта функция явно.
   */
  async clearAll() {
    await db.execute('DELETE FROM operations');
  },

  async markSending(ids) {
    await this._setStatus(ids, STATUS.SENDING);
  },

  /**
   * Возвращает операции в pending: сети не было или сервер ответил ошибкой —
   * попробуем в следующем sync().
   * @param {Array<string>} ids
   */
  async markPending(ids) {
    await this._setStatus(ids, STATUS.PENDING);
  },

  /**
   * Учитывает неудачную попытку отправки: увеличивает счётчик и решает судьбу
   * операции (Фаза 12; дефект живого прогона 11.6).
   *
   * Раньше любая ошибка сервера возвращала операцию в `pending`, и она
   * повторялась до бесконечности: очередь тихо копила дубли, а неисправимая
   * операция (чужой/удалённый заказ) висела вечно.
   *
   * @param {string} id операции
   * @param {number} attempts новое значение счётчика попыток
   * @param {boolean} giveUp true — исчерпан лимит или ошибка неисправима → `failed`
   */
  async registerFailure(id, attempts, giveUp = false) {
    await db.execute(
      `UPDATE operations SET status = ?, attempts = ?, updated_at = ? WHERE id = ?`,
      [giveUp ? STATUS.FAILED : STATUS.PENDING, attempts, Date.now(), id]
    );
  },

  /** Сколько операций «сдалось» (для индикатора и «Режима разработчика»). */
  async countFailed() {
    const rows = await db.query(
      `SELECT COUNT(*) AS count FROM operations WHERE status = ?`,
      [STATUS.FAILED]
    );
    return rows.length ? rows[0].count : 0;
  },

  /** Убирает «сдавшиеся» операции из очереди (действие из отладочной панели). */
  async clearFailed() {
    await db.execute('DELETE FROM operations WHERE status = ?', [STATUS.FAILED]);
  },

  async _setStatus(ids, status) {
    if (!ids || !ids.length) return;

    const placeholders = ids.map(() => '?').join(', ');

    await db.execute(
      `UPDATE operations SET status = ?, updated_at = ? WHERE id IN (${placeholders})`,
      [status, Date.now(), ...ids]
    );
  },

  /**
   * Отмечает операцию доставленной: сначала фиксируем факт подтверждения сервером
   * (отдельным коммитом), затем в одной транзакции удаляем операцию из очереди и
   * «примиряем» локальную запись с ответом сервера.
   *
   * Если приложение упадёт между ответом сервера и «примирением», операция
   * останется в очереди в статусе synced и не потеряется — см. recoverInFlight().
   *
   * @param {object} op - операция из очереди (с распарсенным payload)
   * @param {object} serverRes - элемент ответа сервера (`{ server_id, updated_at }`)
   */
  async markSynced(op, serverRes) {
    await db.execute(
      `UPDATE operations SET status = ?, updated_at = ? WHERE id = ?`,
      [STATUS.SYNCED, Date.now(), op.id]
    );

    const serverId = serverRes?.server_id ?? serverRes?.id;
    const localId = op.payload?.local_id;
    const updatedAt = serverRes?.updated_at;

    await db.transaction(async () => {
      await db.execute(`DELETE FROM operations WHERE id = ?`, [op.id]);

      // INSERT — запоминаем серверный id, иначе «дети» этой записи не смогут уехать.
      if (op.type === 'insert' && serverId != null && localId) {
        await db.execute(
          `UPDATE ${op.table} SET server_id = ? WHERE id = ?`,
          [serverId, localId]
        );
      }

      // Связки без своего PK (`order_service`): запоминаем серверные id родителей,
      // чтобы удаление строки ушло по натуральному ключу, а не «потерялось».
      const parentIds = RECONCILE_PARENT_IDS[op.table];

      if (op.type === 'insert' && localId && parentIds) {
        const columns = Object.keys(parentIds);
        const values = columns.map(column => op.payload?.[parentIds[column]] ?? null);

        await db.execute(
          `UPDATE ${op.table} SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE id = ?`,
          [...values, localId]
        );
      }

      // Версия записи от сервера (задача 3.8): сохраняем её локально, чтобы более
      // старая копия не «воскрешала» запись (last-write-wins) и чтобы у обоих
      // устройств была одна и та же версия. Сервер отдаёт ISO-строку (UTC),
      // локально храним UNIX-секунды.
      if (updatedAt != null) {
        const stamp = toEpochSeconds(updatedAt);

        if (op.type === 'insert') {
          // В payload insert локальный id записи лежит в `local_id`.
          if (localId) {
            await db.execute(
              `UPDATE ${op.table} SET updated_at = ? WHERE id = ?`,
              [stamp, localId]
            );
          }
        } else if (serverId != null) {
          // В payload update/delete `id` — это СЕРВЕРНЫЙ id записи (`payload.id`),
          // поэтому локальную строку ищем по `server_id`: по `id` она бы не нашлась
          // (там локальный UUID), и версия осталась бы «клиентской».
          await db.execute(
            `UPDATE ${op.table} SET updated_at = ? WHERE server_id = ?`,
            [stamp, serverId]
          );
        }
      }
    });
  },

  /**
   * Возвращает в работу операции, «зависшие» в in-flight статусах после сбоя:
   *   • sending — неизвестно, дошёл ли запрос до сервера;
   *   • synced + insert — сервер применил, но `server_id` локально мог не проставиться,
   *     поэтому операцию нужно отправить заново;
   *   • synced + update/delete — сервер применил, «примирять» нечего (локальная запись
   *     уже в нужном состоянии) — операцию убираем.
   *
   * Без этого шага очередь бы «застряла»: dequeue() отдаёт только pending.
   * Повторная отправка может создать дубль на сервере, пока нет серверной
   * идемпотентности (задача 3.5) — это осознанный выбор в пользу «не потерять данные».
   *
   * ⚠️ Восстановление не отличает «свою» in-flight операцию от операции другой вкладки
   * того же устройства: одновременный sync() в двух вкладках может привести к повторной
   * отправке. Координация вкладок — вне задачи 3.3 (см. 3.6).
   *
   * @returns {Promise<number>} сколько in-flight операций найдено после сбоя
   *   (update/delete из них снимаются, остальные возвращаются в pending)
   */
  async recoverInFlight() {
    const stuck = await db.query(
      `SELECT COUNT(*) AS count FROM operations WHERE status IN (?, ?)`,
      [STATUS.SENDING, STATUS.SYNCED]
    );
    const count = stuck.length ? stuck[0].count : 0;

    if (!count) return 0;

    await db.transaction(async () => {
      // update/delete сервер уже применил — «примирять» нечего, операция лишняя.
      await db.execute(
        `DELETE FROM operations WHERE status = ? AND type <> 'insert'`,
        [STATUS.SYNCED]
      );

      await db.execute(
        `UPDATE operations SET status = ?, updated_at = ? WHERE status IN (?, ?)`,
        [STATUS.PENDING, Date.now(), STATUS.SENDING, STATUS.SYNCED]
      );
    });

    return count;
  },

  /**
   * Удаляет из очереди операцию 'insert' по локальному ID записи.
   * Это нужно, чтобы отменить создание записи, которая еще не была синхронизирована.
   * @param {string} tableName - Имя таблицы
   * @param {string} localId - Локальный ID записи
   */
  async removeByLocalId(tableName, localId) {
    const operations = await db.query(
      `SELECT * FROM operations WHERE "table" = ? AND type = 'insert'`,
      [tableName]
    );

    for (const op of operations) {
      const payload = JSON.parse(op.payload);

      if (payload.local_id === localId) {
        await db.execute('DELETE FROM operations WHERE id = ?', [op.id]);
      }
    }
  },

  /**
   * Удаляет из очереди update/delete операции по серверному id записи.
   *
   * Нужно при применении удаления с сервера (задача 3.9): если оставить операцию,
   * локально удалённая строка «воскреснет» следующей же отправкой (update по ней
   * вернёт `RECORD_NOT_FOUND`, и операция зациклится).
   *
   * @param {string} tableName - Имя таблицы
   * @param {number|string} serverId - Серверный id записи (в payload это `id`)
   */
  async removeByServerId(tableName, serverId) {
    const operations = await db.query(
      `SELECT * FROM operations WHERE "table" = ? AND type <> 'insert'`,
      [tableName]
    );

    for (const op of operations) {
      let payload;

      try {
        payload = JSON.parse(op.payload);
      } catch {
        continue;
      }

      if (payload?.id != null && String(payload.id) === String(serverId)) {
        await db.execute('DELETE FROM operations WHERE id = ?', [op.id]);
      }
    }
  }
};
