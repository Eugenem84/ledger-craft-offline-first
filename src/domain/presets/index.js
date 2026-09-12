// src/domain/presets/index.js
//
// Реестр пресетов специализаций (Фаза 10, задача 10.4, решение D5).
//
// Пресет — это контент: стартовый каталог + метаданные UI. Сервер (задача 10.7)
// может прислать обновлённый пресет, но офлайн-первый вход работает на этих
// клиентских JSON. Дальше перечень ниш расширяется добавлением файла, а не правкой
// кода экранов.
import bike from './bike.js';
import aquarium from './aquarium.js';
import hvac from './hvac.js';
import auto from './auto.js';

/** Порядок важен: он же порядок карточек «Начать с шаблона» и выбора при регистрации. */
export const PRESETS = Object.freeze([bike, aquarium, hvac, auto]);

/** Быстрый доступ по `preset_key`. */
const BY_KEY = Object.freeze(
  Object.fromEntries(PRESETS.map(preset => [preset.key, preset]))
);

/** Все доступные `preset_key`. */
export const PRESET_KEYS = Object.freeze(PRESETS.map(preset => preset.key));

/**
 * @param {string|null|undefined} key `bike` / `aquarium` / `hvac` / `auto`
 * @returns {object|null} пресет или `null`, если ключ неизвестен/пустой
 */
export function getPreset(key) {
  if (!key) return null;
  return BY_KEY[key] || null;
}

/** Есть ли такой пресет. */
export function hasPreset(key) {
  return Boolean(getPreset(key));
}

/** Только метаданные для пикеров (без каталога) — экономим вычисления в UI. */
export function presetOptions() {
  return PRESETS.map(preset => ({
    key: preset.key,
    label: preset.label,
    icon: preset.icon,
    accent: preset.accent,
  }));
}

export default PRESETS;
