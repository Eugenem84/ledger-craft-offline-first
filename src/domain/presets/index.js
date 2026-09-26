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
import electric from './electric.js';
import plumbing from './plumbing.js';
import appliance from './appliance.js';
import phone from './phone.js';
import computer from './computer.js';
import furniture from './furniture.js';
import windows from './windows.js';
import cleaning from './cleaning.js';

/**
 * Порядок важен: он же порядок карточек «Начать с шаблона» и выбора при регистрации.
 * Сначала четыре ниши v1 (решение D5), затем расширение реестра — ниши массовых
 * офлайн-мастеров (электрик, сантехник, бытовая техника, телефоны, компьютер,
 * мебель, окна/двери, клининг). Каждой нише нужен **и** клиентский файл здесь,
 * **и** контент в серверном сиде `SpecializationTemplateSeeder` (иначе серверный
 * `content` для неизвестного клиенту ключа игнорируется).
 */
export const PRESETS = Object.freeze([
  bike,
  aquarium,
  hvac,
  auto,
  electric,
  plumbing,
  appliance,
  phone,
  computer,
  furniture,
  windows,
  cleaning,
]);

/** Быстрый доступ по `preset_key`. */
const BY_KEY = Object.freeze(
  Object.fromEntries(PRESETS.map(preset => [preset.key, preset]))
);

/** Все доступные `preset_key`. */
export const PRESET_KEYS = Object.freeze(PRESETS.map(preset => preset.key));

/**
 * @param {string|null|undefined} key `preset_key` из `PRESETS`
 *   (`bike` / `aquarium` / `hvac` / `auto` / `electric` / … / `cleaning`)
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
