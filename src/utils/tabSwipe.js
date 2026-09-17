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

/**
 * Параллакс фона: насколько сильно картинка едет при листании.
 *
 * Модель — «картинка всегда по ширине экрана»: фон **не увеличивается вообще**, поэтому по
 * горизонтали ничего не обрезается (правка владельца 17.09.2026: «по горизонтали картинка
 * начинается не от края до края, она почему то обрезается слева и справа» — так выглядел
 * `object-fit: cover` у квадратного кадра: на портретном экране он показывал только
 * центральные 45 % ширины).
 *
 * Следствие: кадр шире пропорций экрана (квадрат на портретном телефоне) встаёт полосой в
 * центре, сверху и снизу — чёрный фон приложения (у тёмных картинок этого не видно). Именно
 * это свободное место по вертикали и есть запас для движения — фон едет по нему.
 *
 *   • `BACKGROUND_SHIFT_MAX` — предел хода, % высоты экрана (дальше картинку «уносит»);
 *   • `BACKGROUND_SLACK_USAGE` — какую долю свободного места используем (остаток — гарантия,
 *     что край картинки не вылезет в кадр).
 *
 * Ход = `min(BACKGROUND_SHIFT_MAX, свободное место × BACKGROUND_SLACK_USAGE)`: у кадра ровно
 * в пропорциях экрана свободного места нет, поэтому фон стоит — увеличивать его нельзя (это
 * и была бы обрезка по бокам). Каким должен быть кадр, чтобы параллакс был, — в ТЗ
 * (`docs/UI.md` §7).
 */
export const BACKGROUND_SHIFT_MAX = 12
export const BACKGROUND_SLACK_USAGE = 0.6

/** `-0` — валидный JavaScript, но в CSS-строку попадёт `-0.00%`, а `Object.is` на нём спотыкается. */
function normalizeZero(value) {
  return value === 0 ? 0 : value
}

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
 * Раскладка фона: насколько увеличить картинку и на сколько её сдвинуть.
 *
 * Параллакс устроен так: картинка закрывает вьюпорт целиком (`object-fit: cover`), поэтому
 * «лишняя» ширина картинки (когда она шире пропорций экрана — как квадрат на портретном
 * телефоне) и есть запас, внутри которого можно двигать картинку, не оголяя край.
 *
 * Отсюда две величины:
 *   • `scale` — дополнительное увеличение. Нужно только если своего запаса у картинки нет
 *     (кадр ровно 9:20 на портретном экране): тогда картинку приходится чуть увеличить,
 *     чтобы сдвиг вообще был возможен. Квадрат увеличивать не нужно — иначе теряется и
 *     резкость, и часть композиции;
 *   • `shift` — сдвиг по X в % ширины экрана. Берётся доля фактического запаса
 *     (`BACKGROUND_SLACK_USAGE`), но не меньше `BACKGROUND_SHIFT_MIN` (иначе параллакса не
 *     видно) и не больше `BACKGROUND_SHIFT_MAX` (иначе «уносит»).
 *
 * Пока размер картинки неизвестен (не загрузилась), возвращается осторожная раскладка:
 * `scale` 1.25 и минимальный сдвиг — ровно то, что гарантирует запас на любой кадр.
 *
 * @param {object} params
 * @param {number} params.viewportWidth ширина вьюпорта, px
 * @param {number} params.viewportHeight высота вьюпорта, px
 * @param {number} [params.imageWidth] натуральная ширина картинки, px
 * @param {number} [params.imageHeight] натуральная высота картинки, px
 * @param {number} [params.offset] положение вкладки: -1 первая, 0 середина, +1 последняя
 * @returns {{ scale: number, shift: number }} увеличение (≥1) и сдвиг по X, % ширины экрана
 */
export function backgroundLayout({
  viewportWidth,
  viewportHeight,
  imageWidth,
  imageHeight,
  offset = 0,
}) {
  const vw = Number(viewportWidth)
  const vh = Number(viewportHeight)
  const iw = Number(imageWidth)
  const ih = Number(imageHeight)
  const position = Number.isFinite(Number(offset)) ? Number(offset) : 0

  // Пока размер картинки не измерен (или данные мусорные) — фон стоит: обрезки нет,
  // движения тоже (считать его не из чего).
  const still = { scale: 1, shiftX: 0, shiftY: 0 }

  if (!(vw > 0) || !(vh > 0) || !(iw > 0) || !(ih > 0)) return still

  // Картинка растягивается ровно по ширине экрана, высота — по пропорциям кадра.
  const displayedHeight = (vw * ih) / iw

  // Свободное место по вертикали: у полосы (кадр шире экрана) это расстояния до краёв
  // экрана, у высокого кадра — его скрытые верх и низ. Ноль — кадр ровно в пропорциях экрана.
  const reserve = Math.abs(displayedHeight - vh) / 2

  if (reserve <= 0) return still

  const amplitude = Math.min(BACKGROUND_SHIFT_MAX, ((reserve * BACKGROUND_SLACK_USAGE) / vh) * 100)

  return {
    // Увеличения нет — это и есть обещание «по бокам ничего не обрезается».
    scale: 1,
    shiftX: 0,
    // Знак: на первой вкладке картинка внизу своего свободного места, на последней — вверху
    // (вкладки уходят вправо, «дальний план» уезжает вверх).
    shiftY: Number(normalizeZero((-position * amplitude * vh) / 100).toFixed(2)),
  }
}

/** Имя CSS-перехода для смены раздела: входящая страница приходит со стороны свайпа. */
export function swipeTransitionName(previousIndex, nextIndex) {
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) return ''
  return nextIndex > previousIndex ? 'lc-swipe-next' : 'lc-swipe-prev'
}
