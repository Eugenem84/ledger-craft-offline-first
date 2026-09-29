// src/domain/lexicon.js
//
// Лексикон терминов специализации (Фаза 10, задача 10.1, решение D4/D5).
//
// Раньше слова были захардкожены по месту: в `src/` «заказ» встречался ~86 раз,
// «товар» — ~42, «модель техники» — ~8. Из-за этого один и тот же UI говорил
// «товар» и веломастеру, и аквариумисту. Теперь слова живут в одном словаре:
// ключ → подпись, а значения выбираются по `preset_key` активного профиля.
//
// Важно: лексикон — это **только представление**. Он не меняет ни одной таблицы,
// ни заголовков синка, ни схемы. Фолбэк — общий (универсальный) словарь, поэтому
// профиль без пресета продолжает работать как раньше.

/** Общий словарь: используется, если у профиля нет пресета или слова нет в пресете. */
export const DEFAULT_LEXICON = Object.freeze({
  order: 'заказ',
  part: 'товар',
  // Правка владельца (29.09.2026): объединённый список «товары» — и товары со склада, и
  // разовые покупки («вне склада») одним списком с тегом источника. Слово **одно на все
  // ниши**: «товар» — самое общее (и запчасть, и масло, и упаковка, и расходник).
  parts: 'товары',
  fromStock: 'со склада',
  purchase: 'покупка (вне склада)',
  model: 'модель техники',
  catalog: 'каталог',
  stock: 'склад',
  client: 'клиент',
  service: 'работа',
  // Одно опциональное поле заказа под «внешний идентификатор объекта» (задача 10.9).
  equipmentIdentifier: 'идентификатор объекта',
});

/** Словари по `preset_key`. Частичные — недостающие ключи берутся из `DEFAULT_LEXICON`. */
export const LEXICONS = Object.freeze({
  bike: Object.freeze({
    model: 'велосипед',
    service: 'работа',
    equipmentIdentifier: 'серийный номер рамы',
  }),
  aquarium: Object.freeze({
    model: 'аквариум',
    equipmentIdentifier: 'номер аквариума',
  }),
  hvac: Object.freeze({
    model: 'объект',
    equipmentIdentifier: 'адрес объекта',
  }),
  auto: Object.freeze({
    model: 'автомобиль',
    equipmentIdentifier: 'VIN / госномер',
  }),
  // Расширение реестра ниш: массовые офлайн-мастера. Переопределены только слова,
  // которые в нише звучат иначе; остальные берутся из `DEFAULT_LEXICON`.
  electric: Object.freeze({
    model: 'объект',
    equipmentIdentifier: 'адрес объекта',
  }),
  plumbing: Object.freeze({
    model: 'объект',
    equipmentIdentifier: 'адрес объекта',
  }),
  appliance: Object.freeze({
    model: 'прибор',
    equipmentIdentifier: 'серийный номер',
  }),
  phone: Object.freeze({
    model: 'устройство',
    equipmentIdentifier: 'IMEI / серийный номер',
  }),
  computer: Object.freeze({
    model: 'устройство',
    equipmentIdentifier: 'серийный номер',
  }),
  furniture: Object.freeze({
    model: 'предмет мебели',
    equipmentIdentifier: 'номер заказа',
  }),
  windows: Object.freeze({
    model: 'изделие',
    equipmentIdentifier: 'адрес объекта',
  }),
  cleaning: Object.freeze({
    model: 'объект',
    equipmentIdentifier: 'адрес объекта',
  }),
});

/** Все ключи лексикона (удобно для тестов и для проверки «нет ли забытых слов»). */
export const LEXICON_KEYS = Object.freeze(Object.keys(DEFAULT_LEXICON));

/**
 * Словарь для пресета: общий + переопределения ниши.
 *
 * @param {string|null|undefined} presetKey `bike` / `aquarium` / `hvac` / `auto`
 * @returns {Record<string, string>} полный словарь (все ключи `LEXICON_KEYS`)
 */
export function getLexicon(presetKey) {
  return { ...DEFAULT_LEXICON, ...(LEXICONS[presetKey] || {}) };
}

/**
 * Подпись по ключу. Неизвестный ключ отдаётся как есть (не роняем UI из-за
 * опечатки в компоненте, но и молча пустую строку не показываем).
 *
 * @param {string} key
 * @param {string|null} [presetKey]
 * @returns {string}
 */
export function translate(key, presetKey = null) {
  return getLexicon(presetKey)[key] ?? key;
}

// `useLexicon()` живёт здесь же (как и планировалось в 10.1): компоненты
// получают реактивный словарь, не зная, откуда взялся `preset_key`.
import { computed } from 'vue';
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js';

/**
 * Реактивный лексикон активного профиля.
 *
 * @returns {{ t: (key: string) => string, lexicon: import('vue').ComputedRef<Record<string,string>>, presetKey: import('vue').ComputedRef<string|null> }}
 */
export function useLexicon() {
  const store = useSpecializationsStore();
  const presetKey = computed(() => store.activePreset?.key || null);
  const lexicon = computed(() => getLexicon(presetKey.value));

  return {
    lexicon,
    presetKey,
    t: key => lexicon.value[key] ?? key,
  };
}
