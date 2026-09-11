// src/utils/timestamps.js
//
// Приведение серверных timestamps к локальному стандарту (UNIX-секунды, INTEGER).
//
// Laravel отдаёт `created_at`/`updated_at` ISO-строками (`2026-09-11T10:00:00.000000Z`),
// а локальные колонки — целые секунды (см. docs/DATA-MODEL.md). Если писать ISO-строку
// в INTEGER-колонку, SQLite сохранит текст, и сравнение «серверная версия новее?»
// перестанет работать.
//
// ⚠️ Старые репозитории (clients/services/products/orders/...) пока пишут значение как
// пришло — привести их к этому хелперу стоит в 3.8 (версии/конфликты).

/**
 * @param {unknown} value — ISO-строка, число (секунды/миллисекунды) или null
 * @param {number} [fallback] — что вернуть, если значения нет
 * @returns {number} UNIX-секунды
 */
export function toEpochSeconds(value, fallback = Math.floor(Date.now() / 1000)) {
  if (value == null) return fallback;

  if (typeof value === 'number') {
    // Грубая эвристика: миллисекунды «в будущем» относительно секунд (год 2001+).
    return value > 1e11 ? Math.floor(value / 1000) : Math.floor(value);
  }

  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? fallback : Math.floor(ms / 1000);
}
