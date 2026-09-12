// src/services/presetService.js
//
// Пресеты на сервере + офлайн-кэш (Фаза 10, задача 10.7, решение D5).
//
// Сервер — источник **контента** пресета (категории → услуги с ценами, категории
// товаров, модели): поправить его можно без релиза приложения. Метаданные UI
// (лексикон, акцент, флаги) остаются локальными — от них зависит представление,
// и они не должны «уезжать» вместе с контентом.
//
// Офлайн-первый вход: клиент держит read-only кэш в `meta` и при отсутствии
// сети/кэша использует клиентские JSON из `src/domain/presets` (задача 10.4).
import { apiClient } from 'src/services/api.js'
import * as metaRepo from 'src/repositories/metaRepo.js'
import { getPreset } from 'src/domain/presets/index.js'

/** Ключ read-only кэша пресетов в таблице `meta`. */
export const TEMPLATES_META_KEY = 'specialization_templates';

/**
 * Разбирает содержимое кэша/ответа сервера в список пресетов.
 * Битый или неполный ответ не должен ронять онбординг — отдаём то, что валидно.
 *
 * @param {string|Array|null|undefined} raw
 * @returns {Array<{preset_key: string, version?: number, content?: object}>}
 */
export function parseTemplates(raw) {
  if (!raw) return [];

  let parsed = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!parsed || typeof parsed !== 'object') return [];

  // Сервер отдаёт `{ templates: [...] }`, кэш хранит уже сам массив.
  const list = Array.isArray(parsed) ? parsed : parsed.templates;

  if (!Array.isArray(list)) return [];

  return list.filter(item => item && typeof item.preset_key === 'string');
}

/** Контент пресета из списка (или `null`, если такого пресета на сервере нет). */
export function contentFromTemplates(templates, presetKey) {
  const found = (templates || []).find(item => item.preset_key === presetKey);
  return found?.content && typeof found.content === 'object' ? found.content : null;
}

/**
 * Сливает серверный контент с локальным пресетом: обновляем только каталог,
 * метаданные UI (accent/features/lexicon) берём из клиента.
 *
 * @param {object|null} preset клиентский пресет
 * @param {object|null} content контент с сервера
 * @returns {object|null} пресет для материализации
 */
export function mergePreset(preset, content) {
  if (!preset) return null;
  if (!content) return preset;

  const pick = (serverValue, localValue) =>
    Array.isArray(serverValue) && serverValue.length ? serverValue : localValue;

  return {
    ...preset,
    categories: pick(content.categories, preset.categories),
    productCategories: pick(content.productCategories, preset.productCategories),
    models: pick(content.models, preset.models),
  };
}

/**
 * Читает кэш пресетов из `meta`.
 *
 * @param {{ getValue?: (key: string) => Promise<string|null> }} [deps]
 * @returns {Promise<Array>}
 */
export async function getCachedTemplates({ getValue = metaRepo.getValue } = {}) {
  return parseTemplates(await getValue(TEMPLATES_META_KEY));
}

/**
 * Забирает пресеты с сервера и кладёт их в read-only кэш.
 * Бросает при сетевой ошибке — вызывающий решает, показывать ли это пользователю.
 *
 * @param {{ api?: object, setValue?: (key: string, value: string) => Promise<void> }} [deps]
 * @returns {Promise<Array>}
 */
export async function refreshTemplates({ api = apiClient, setValue = metaRepo.setValue } = {}) {
  const { data } = await api.get('/specialization-templates');
  const templates = parseTemplates(data);

  await setValue(TEMPLATES_META_KEY, JSON.stringify(templates));

  return templates;
}

/**
 * Пресет для применения: клиентские метаданные + серверный контент из кэша.
 * Любая проблема с кэшем — не повод не применять шаблон (фолбэк на локальный JSON).
 *
 * @param {string} presetKey
 * @param {{ getValue?: (key: string) => Promise<string|null> }} [deps]
 * @returns {Promise<object|null>}
 */
export async function resolvePreset(presetKey, { getValue = metaRepo.getValue } = {}) {
  const preset = getPreset(presetKey);
  if (!preset) return null;

  try {
    const templates = await getCachedTemplates({ getValue });
    return mergePreset(preset, contentFromTemplates(templates, presetKey));
  } catch {
    return preset;
  }
}
