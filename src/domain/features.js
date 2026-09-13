// src/domain/features.js
//
// Видимость вкладок и блоков по пресету (Фаза 10, задача 10.3, решение D5).
//
// Мастеру по аквариумам склад не нужен, «модели техники» — не всем нишам,
// share-ссылка на отчёт — не всем. Раньше `MainLayout.vue` жёстко рисовал
// «ордеры / склад / каталог / аналитика / другие». Теперь состав вкладок —
// это данные пресета (`features`), а не код.
//
// Флаги приходят из `specializations.features` (JSON) либо из пресета; если
// ничего не задано — включено всё (как было до Фазы 10).
import { computed } from 'vue';
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js';
import { getPreset } from 'src/domain/presets/index.js';

/** Всё включено: поведение по умолчанию для профиля без пресета. */
export const DEFAULT_FEATURES = Object.freeze({
  store: true,
  models: true,
  analytics: true,
  shareLink: true,
  // Одно опциональное поле заказа «внешний идентификатор объекта» (задача 10.9):
  // не всем нишам оно нужно (велосервису — да, аквариумисту — нет), поэтому это
  // тоже флаг видимости.
  equipmentIdentifier: true,
});

/** Ключи флагов и человекочитаемые названия (для экрана управления профилем). */
export const FEATURE_LABELS = Object.freeze({
  store: 'склад',
  models: 'модели техники',
  analytics: 'аналитика',
  shareLink: 'share-ссылка на отчёт',
  equipmentIdentifier: 'идентификатор объекта',
});

/**
 * Пояснения к флагам для тумблеров в настройках профиля (задача 10.3; доработка).
 *
 * Раньше карточка «разделы профиля» была read-only, а флаги приходили только из
 * пресета. Теперь пользователь сам включает/выключает разделы текущего профиля,
 * поэтому у каждого флага нужно короткое «что именно скроется».
 */
export const FEATURE_HINTS = Object.freeze({
  store: 'категории товаров, остатки и закупочные цены',
  models: 'блок «модель техники» в карточке заказа',
  analytics: 'раздел с выручкой, топами и маржой',
  shareLink: 'кнопка публичной ссылки на отчёт в заказе',
  equipmentIdentifier: 'поле «внешний идентификатор объекта» в заказе',
});

/**
 * Нормализует флаги: принимает JSON-строку (как лежит в БД) или объект.
 *
 * @param {string|object|null|undefined} source
 * @returns {Record<string, boolean>}
 */
export function normalizeFeatures(source) {
  if (!source) return { ...DEFAULT_FEATURES };

  let parsed = source;

  if (typeof source === 'string') {
    try {
      parsed = JSON.parse(source);
    } catch {
      return { ...DEFAULT_FEATURES };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_FEATURES };
  }

  // Неизвестные ключи игнорируем, известные приводим к boolean.
  return Object.fromEntries(
    Object.keys(DEFAULT_FEATURES).map(key => [key, parsed[key] === undefined ? true : Boolean(parsed[key])])
  );
}

/** Сериализует флаги для хранения в `specializations.features` (TEXT/JSON). */
export function serializeFeatures(features) {
  return JSON.stringify(normalizeFeatures(features));
}

/**
 * Флаги активного профиля: приоритет у полей специализации, затем — у пресета.
 *
 * @param {{ preset_key?: string|null, features?: (string|object|null) }} [specialization]
 * @returns {Record<string, boolean>}
 */
export function resolveFeatures(specialization) {
  if (specialization?.features) return normalizeFeatures(specialization.features);

  const preset = getPreset(specialization?.preset_key);
  if (preset?.features) return normalizeFeatures(preset.features);

  return { ...DEFAULT_FEATURES };
}

/**
 * Реактивные флаги активного профиля (для `MainLayout.vue` и блоков формы заказа).
 *
 * @returns {{ features: import('vue').ComputedRef<Record<string, boolean>>, isEnabled: (flag: string) => boolean }}
 */
export function useFeatures() {
  const store = useSpecializationsStore();
  const features = computed(() => resolveFeatures(store.getSelectedSpecialization));

  return {
    features,
    isEnabled: flag => features.value[flag] !== false,
  };
}
