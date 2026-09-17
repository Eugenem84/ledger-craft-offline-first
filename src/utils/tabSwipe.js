// src/utils/tabSwipe.js
//
// Свайп по разделам нижней навигации (правка владельца 17.09.2026: «сделать, чтобы
// переключение "заказ", "склад", "каталог" осуществлялось свайпом»).
//
// Здесь только «чистая» логика — какой вкладке соответствует текущий путь, куда ведёт
// жест и не начинается ли он в зоне, которую забирает система. Она тестируется без
// Vue/Quasar/DOM (`test/swipe-navigation.test.js`).
//
// Сам жест распознаёт директива Quasar `v-touch-swipe` (она умеет доминанту по
// горизонтали и порог по скорости), а решение «переходим на соседнюю вкладку» принимает
// `layouts/MainLayout.vue` через этот модуль. Порядок вкладок — тот же массив `tabs`,
// что рисует таббар (а не порядок в `router/routes.js`: «каталог» там объявлен последним).

/**
 * Зона у краёв экрана, где горизонтальный жест забирает система (Android 15 со
 * свайп-навигацией: «назад» начинается от левого края). Жест, начавшийся здесь,
 * приложению не отдаём — иначе свайп назад менял бы раздел.
 */
export const SWIPE_EDGE_GUARD = 24

/** Смещение картинки-фона на крайних вкладках, % ширины (запас даёт `scale(1.25)`). */
export const BACKGROUND_PARALLAX_PERCENT = 8

/**
 * Индекс вкладки по текущему пути.
 *
 * @param {Array<{ to?: string }>} tabs вкладки таббара (в порядке слева направо)
 * @param {string} path текущий путь (`/orders`, `/store`, …)
 * @returns {number} индекс или `-1`, если путь — не вкладка (карточка заказа и т.п.)
 */
export function tabIndexByPath(tabs, path) {
  if (!Array.isArray(tabs) || typeof path !== 'string') return -1
  return tabs.findIndex((tab) => tab?.to === path)
}

/**
 * Куда ведёт жест: палец влево — вкладка правее («next»), палец вправо — левее.
 *
 * @param {'left'|'right'|string} direction направление свайпа из `v-touch-swipe`
 * @returns {'next'|'prev'|null}
 */
export function swipeStep(direction) {
  if (direction === 'left') return 'next'
  if (direction === 'right') return 'prev'
  return null
}

/**
 * Путь соседней вкладки. Края списка не заворачиваются: на первой вкладке свайп вправо
 * и на последней свайп влево ничего не делают.
 *
 * @param {Array<{ to?: string }>} tabs вкладки таббара
 * @param {string} path текущий путь
 * @param {'left'|'right'|string} direction направление свайпа
 * @returns {string|null} путь соседней вкладки или `null`, если переходить некуда
 */
export function resolveSwipeTarget(tabs, path, direction) {
  const step = swipeStep(direction)
  if (step === null) return null

  const index = tabIndexByPath(tabs, path)
  if (index < 0 || !Array.isArray(tabs) || tabs.length < 2) return null

  const next = step === 'next' ? index + 1 : index - 1
  if (next < 0 || next >= tabs.length) return null

  return tabs[next]?.to ?? null
}

/**
 * Жест начался у самого края экрана — его может перехватить системная навигация.
 *
 * @param {number} startX координата начала жеста, px
 * @param {number} viewportWidth ширина вьюпорта, px
 * @param {number} [guard] ширина «системной» зоны у каждого края
 * @returns {boolean} `true` — жест не наш
 */
export function isEdgeGesture(startX, viewportWidth, guard = SWIPE_EDGE_GUARD) {
  if (!Number.isFinite(startX) || !Number.isFinite(viewportWidth)) return true
  if (viewportWidth <= guard * 2) return true
  return startX <= guard || viewportWidth - startX <= guard
}

/**
 * Худшее отклонение по вертикали, при котором жест ещё считаем листанием.
 *
 * `v-touch-swipe` пускает свайп при `absX > absY` и допускает до 100px ухода по
 * вертикали — на длинном списке это «диагональный скролл», который неожиданно менял бы
 * раздел. Поэтому свою проверку делаем жёстче.
 */
export const SWIPE_MAX_DRIFT_Y = 40

/**
 * Свайп «годен»: есть куда перейти и жест не похож на прокрутку.
 *
 * @param {{ direction?: string, distance?: { x?: number, y?: number } }} info данные `v-touch-swipe`
 * @param {Array<{ to?: string }>} tabs вкладки таббара
 * @param {string} path текущий путь
 * @param {boolean} armed жест уже «израсходован» этим касанием?
 * @returns {string|null} путь для перехода
 */
export function resolveSwipe(info, tabs, path, armed) {
  if (armed !== true) return null

  const vertical = Number(info?.distance?.y)
  if (Number.isFinite(vertical) && vertical > SWIPE_MAX_DRIFT_Y) return null

  return resolveSwipeTarget(tabs, path, info?.direction)
}

/**
 * Параллакс фона: `-1` на первой вкладке, `0` в середине, `+1` на последней.
 *
 * @param {number} index индекс активной вкладки
 * @param {number} count число вкладок
 * @returns {number} коэффициент от -1 до 1 (0 — если вкладок меньше двух)
 */
export function backgroundOffset(index, count) {
  if (!Number.isInteger(count) || count < 2) return 0
  if (!Number.isInteger(index) || index < 0 || index >= count) return 0

  const half = (count - 1) / 2
  return (index - half) / half
}

/**
 * Сдвиг картинки-фона для вкладки, % ширины: движение вкладок влево-вправо двигает
 * фон в ту же сторону, но заметно меньше — «дальний план отстаёт».
 *
 * @param {number} index индекс активной вкладки
 * @param {number} count число вкладок
 * @returns {number} сдвиг по X, % (отрицательный — картинка уезжает влево)
 */
export function backgroundShift(index, count) {
  const offset = backgroundOffset(index, count)

  // `offset === 0` возвращаем отдельно: `-0` — валидный JavaScript, но в CSS-строку
  // попадёт `-0.00%`, а сравнения в тестах (`Object.is`) на нём спотыкаются.
  return offset === 0 ? 0 : -offset * BACKGROUND_PARALLAX_PERCENT
}

/** Имя CSS-перехода для смены раздела: входящая страница приходит со стороны свайпа. */
export function swipeTransitionName(previousIndex, nextIndex) {
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) return ''
  return nextIndex > previousIndex ? 'lc-swipe-next' : 'lc-swipe-prev'
}
