// src/domain/backgrounds.js
//
// Фоновая картинка рабочего профиля (правка владельца 17.09.2026: «у приложения будет
// фоновая картинка, у каждой специализации своя, и при свайпе она двигается»).
//
// Здесь только «чистая» логика выбора ключа — тестируется без Vue/Quasar (`test/
// swipe-navigation.test.js`). Сам файл лежит в `src/assets/backgrounds/<ключ>.<ext>`
// и подхватывается сборщиком (`services/backgroundAssets.js`), а рисует его
// `components/ui/LcAppBackground.vue`.
//
// Ключ — `preset_key` профиля: то же поле, по которому выбирается пресет (Фаза 10),
// поэтому новая ниша = новый JSON пресета + картинка с тем же именем, без правок кода.

/** Картинка для профиля без пресета (своя ниша, «слепой» профиль) — необязательная. */
export const DEFAULT_BACKGROUND_KEY = 'default'

/**
 * Ключ картинки-фона по профилю.
 *
 * Неизвестный ключ (профиль приехал синком из сборки с другой нишей) — не ошибка:
 * картинки просто нет, и остаётся чёрный фон приложения. Проверять ключ по реестру
 * пресетов здесь не нужно: наличие файла знает только сборщик (`backgroundAssets.js`).
 *
 * @param {{ preset_key?: string|null }} [specialization] активный рабочий профиль
 * @returns {string} `preset_key` в нижнем регистре или `default`
 */
export function resolveBackgroundKey(specialization) {
  const raw = typeof specialization?.preset_key === 'string' ? specialization.preset_key.trim() : ''

  return raw === '' ? DEFAULT_BACKGROUND_KEY : raw.toLowerCase()
}
