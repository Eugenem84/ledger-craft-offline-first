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
 * Параллакс фона: картинка заполняет экран целиком (`cover`) и при листании едет **по
 * горизонтали** — вкладки уходят в сторону, «дальний план» отстаёт.
 *
 * История правки (17.09.2026). Сначала жалоба владельца «по горизонтали картинка начинается не
 * от края до края, она почему то обрезается слева и справа» была понята буквально — «не резать
 * бока» — и фон сделали ровно по ширине экрана, полосой в центре. На живом прогоне выяснилось,
 * что понято было неверно: «картинка должна ездить по горизонтали конечно же при свайпах влево
 * и вправо. И она должна покрывать весь экран конечно же, а не частично». Поэтому вернулись к
 * заполнению экрана, а запас для хода берём из «лишней» ширины кадра: у квадрата на портретном
 * экране её очень много (по 28 % с каждой стороны — они и есть запас), у кадра ровно в
 * пропорциях экрана запаса нет, и он получает небольшое увеличение.
 *
 *   • `BACKGROUND_SHIFT_MIN` — минимальный ход, % ширины экрана (ради него и добавляется
 *     увеличение, если своего запаса у кадра нет) — иначе сдвиг не читается как параллакс;
 *   • `BACKGROUND_SHIFT_MAX` — предел хода, % ширины экрана (дальше картинку «уносит»);
 *   • `BACKGROUND_SLACK_USAGE` — какую долю собственного запаса кадра используем (остаток
 *     гарантирует, что край картинки не оголится).
 */
export const BACKGROUND_SHIFT_MIN = 10
export const BACKGROUND_SHIFT_MAX = 24
export const BACKGROUND_SLACK_USAGE = 0.8

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
 * Раскладка фона: насколько увеличить картинку и на сколько её сдвинуть по горизонтали.
 *
 * Параллакс устроен так: картинка закрывает вьюпорт целиком (`object-fit: cover`), поэтому
 * «лишняя» ширина картинки (когда она шире пропорций экрана — как квадрат на портретном
 * телефоне) и есть запас, внутри которого можно двигать картинку, не оголяя край. Вкладки
 * уходят в сторону — картинка едет за ними, но меньше: «дальний план» отстаёт.
 *
 * Отсюда две величины:
 *   • `scale` — дополнительное увеличение. Нужно только если своего запаса у картинки нет
 *     (кадр ровно в пропорциях экрана): тогда картинку приходится чуть увеличить, чтобы сдвиг
 *     вообще был возможен. Квадрат увеличивать не нужно — иначе теряется и резкость, и часть
 *     композиции;
 *   • `shiftX` — сдвиг по X, px. Берётся доля фактического запаса (`BACKGROUND_SLACK_USAGE`),
 *     но не меньше `BACKGROUND_SHIFT_MIN` (иначе параллакса не видно) и не больше
 *     `BACKGROUND_SHIFT_MAX` (иначе «уносит»).
 *
 * @param {object} params
 * @param {number} params.viewportWidth ширина вьюпорта, px
 * @param {number} params.viewportHeight высота вьюпорта, px
 * @param {number} [params.imageWidth] натуральная ширина картинки, px
 * @param {number} [params.imageHeight] натуральная высота картинки, px
 * @param {number} [params.offset] положение вкладки: -1 первая, 0 середина, +1 последняя
 * @returns {{ scale: number, shiftX: number }} увеличение (≥1) и сдвиг по X, px
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

  // Пока размер картинки не измерен (или данные мусорные) — экран заполняем, но не двигаем:
  // сдвиг считать не из чего.
  const still = { scale: 1, shiftX: 0 }

  if (!(vw > 0) || !(vh > 0) || !(iw > 0) || !(ih > 0)) return still

  // `cover`: картинка масштабируется так, чтобы закрыть экран целиком. Лишняя ширина кадра
  // (у квадрата на портретном экране её очень много) — это и есть запас для хода.
  const coverScale = Math.max(vw / iw, vh / ih)
  const renderedWidth = iw * coverScale
  const slack = Math.max(0, (renderedWidth - vw) / 2)

  const amplitude = Math.min(
    BACKGROUND_SHIFT_MAX,
    Math.max(BACKGROUND_SHIFT_MIN, ((slack * BACKGROUND_SLACK_USAGE) / vw) * 100),
  )

  // Увеличение — только если своего запаса на минимальный ход не хватает (кадр ровно в
  // пропорциях экрана). Тогда оно ровно такое, чтобы ход поместился без оголённого края.
  const scale = Math.max(1, (vw * (1 + (2 * amplitude) / 100)) / renderedWidth)

  return {
    scale: Number(scale.toFixed(4)),
    // Знак: на первой вкладке картинка сдвинута вправо (окно обзора — у её левого края),
    // на последней — влево. Вкладки уходят в сторону, «дальний план» едет за ними.
    shiftX: Number(normalizeZero((-position * amplitude * vw) / 100).toFixed(2)),
  }
}

/** Имя CSS-перехода для смены раздела: входящая страница приходит со стороны свайпа. */
export function swipeTransitionName(previousIndex, nextIndex) {
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) return ''
  return nextIndex > previousIndex ? 'lc-swipe-next' : 'lc-swipe-prev'
}
