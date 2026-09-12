// src/database/mappers/specializations.js
//
// Задача 8.3 + Фаза 10 (10.6): именованные мапперы позиционных аргументов SQL
// для `specializations`. Порядок колонок сверяется с `queries/specializations.js`.
//
// `features` — флаги видимости вкладок (задача 10.3). В SQLite это TEXT, поэтому
// объект сериализуем в JSON, а строку (в т.ч. приехавшую с сервера) храним как есть.

/** `features` → строка для БД (объект → JSON, строка/`null` — без изменений). */
export function featuresToStorage(features) {
  if (features === undefined || features === null || features === '') return null;
  if (typeof features === 'string') return features;

  try {
    return JSON.stringify(features);
  } catch {
    return null;
  }
}

/** `queries.insert`. */
export function specializationInsertParams({ id, specialization }) {
  return [
    id,
    specialization.server_id || null,
    specialization.name,
    specialization.preset_key || null,
    specialization.accent || null,
    featuresToStorage(specialization.features),
    specialization.archived ? 1 : 0,
    specialization.template_version ?? null,
  ];
}

/** `queries.update` (`WHERE id = ?` — последний параметр). */
export function specializationUpdateParams(specialization) {
  return [
    specialization.name,
    specialization.preset_key || null,
    specialization.accent || null,
    featuresToStorage(specialization.features),
    specialization.archived ? 1 : 0,
    specialization.template_version ?? null,
    specialization.id,
  ];
}

/** `queries.insertFromServer`. */
export function specializationInsertFromServerParams({ localId, record, createdAt, updatedAt }) {
  return [
    localId,
    record.id,
    record.name,
    record.preset_key ?? null,
    record.accent ?? null,
    featuresToStorage(record.features),
    record.archived ? 1 : 0,
    record.template_version ?? null,
    createdAt,
    updatedAt,
  ];
}

/** `queries.updateFromServer` (`WHERE server_id = ?` — последний параметр). */
export function specializationUpdateFromServerParams({ record, updatedAt }) {
  return [
    record.name,
    record.preset_key ?? null,
    record.accent ?? null,
    featuresToStorage(record.features),
    record.archived ? 1 : 0,
    record.template_version ?? null,
    updatedAt,
    record.id,
  ];
}
