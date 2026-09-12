// src/domain/theme.js
//
// Акцентный цвет рабочего профиля (Фаза 10, задача 10.2, решение D5).
//
// Полный ре-скин не делаем: `quasar.variables.scss` не трогаем (иначе понадобилась
// бы пересборка), меняем только брендовую переменную `primary` в рантайме через
// `setCssVar` из Quasar 2. Тема тёмная (`dark: true` в `quasar.config.js`), поэтому
// оттенки пресетов подобраны по контрасту, а фон остаётся прежним.
//
// Здесь — только «чистая» логика выбора цвета (тестируется без Vue/Quasar).
// Сам вызов `setCssVar` живёт в `layouts/MainLayout.vue`: это единственное место,
// где домен пересекается с UI-библиотекой.
import { getPreset } from 'src/domain/presets/index.js';

/** Акцент по умолчанию — `$primary` из `quasar.variables.scss` (#1976d2). */
export const DEFAULT_ACCENT = '#1976d2';

/**
 * Цвет акцента специализации: её собственное поле → пресет → дефолт.
 *
 * @param {{ preset_key?: string|null, accent?: string|null }} [specialization]
 * @returns {string} CSS-цвет
 */
export function resolveAccent(specialization) {
  return specialization?.accent || getPreset(specialization?.preset_key)?.accent || DEFAULT_ACCENT;
}
