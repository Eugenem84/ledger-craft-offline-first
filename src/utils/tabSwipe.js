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
 * Параллакс фона: картинка заполняет экран целиком и при листании едет **по горизонтали**.
 *
 * ⚠️ Главная техническая тонкость (живой прогон 17.09.2026, дефект «картинка срезана по краям,
 * а за краями должно быть продолжение»): у `<img>` с `object-fit: cover` содержимое
 * **обрезается по границам самого элемента**, поэтому «запас» существует только если элемент
 * шире вьюпорта. Пока элемент был размером во вьюпорт, сдвиг уводил его край и на экране
 * появлялась чёрная полоса. Поэтому раскладка теперь возвращает явные размеры и позицию
 * картинки в px: элемент шире экрана, его края скрыты за вьюпортом (`.lc-appbg` → `overflow:
 * hidden`), и сдвиг показывает продолжение картинки, а не пустоту.
 *
 * Ещё две тонкости, оттуда же:
 *   • окно обзора центрируется по **самому рисунку**, а не по кадру: у картинок бывают широкие
 *     пустые поля (у `bike.webp` контент занимает 10–70 % ширины), и центрирование по кадру
 *     показывало пустоту сбоку;
 *   • ход ограничен контентом рисунка (`contentBounds`): окно не заезжает в пустые поля, иначе
 *     на экране появляется чёрная полоса — это и выглядело как «срезано».
 */
export const BACKGROUND_SHIFT_MAX = 25
export const BACKGROUND_SHIFT_MIN = 8
export const BACKGROUND_CONTENT_INSET = 0.85
export const BACKGROUND_CONTENT_THRESHOLD = 0.5

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
 * Границы «непустой» части рисунка по колонкам (доли 0..1 от ширины).
 *
 * Нужны, чтобы фон не заезжал в пустые поля кадра: у `bike.webp` контент занимает 10–70 % ширины,
 * и как только окно обзора заходило за границу, на экране появлялась чёрная полоса — это
 * выглядело как «картинка обрезана, а продолжения нет» (живой прогон 17.09.2026).
 *
 * Порог относительный (`средняя × BACKGROUND_CONTENT_THRESHOLD`): картинки бывают очень тёмными
 * — у `bike.webp` контент это 2…6 из 255, и абсолютный порог отрезал бы вообще всё.
 *
 * @param {number[]} columns средняя яркость каждой колонки (0..255), слева направо
 * @returns {{ left: number, right: number }} доли ширины; без данных — весь кадр (0..1)
 */
export function contentBounds(columns) {
  const values = Array.isArray(columns) ? columns.filter((v) => Number.isFinite(v)) : []

  if (values.length === 0) return { left: 0, right: 1 }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  // Нижняя граница порога — 1.5 из 255: совсем тёмные пиксели (1 — это почти чистый чёрный)
  // контентом не считаем, иначе поля кадра «прирастают» и ход получается шире рисунка.
  const threshold = Math.max(1.5, mean * BACKGROUND_CONTENT_THRESHOLD)
  const isContent = (value) => value >= threshold

  const first = values.findIndex(isContent)
  if (first < 0) return { left: 0, right: 1 }

  let last = values.length - 1

  while (last > first && !isContent(values[last])) last -= 1

  return { left: first / values.length, right: (last + 1) / values.length }
}

const clamp01 = (value) =>
  Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0))
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round2 = (value) => Number(value.toFixed(2))

/**
 * Раскладка фона: размеры и позиция картинки (px) плюс сдвиг по вкладкам.
 *
 * Картинка закрывает экран целиком (`cover`), её элемент **шире вьюпорта** — края скрыты за
 * экраном, поэтому сдвиг показывает продолжение рисунка, а не пустоту (см. комментарий к
 * константам). Окно обзора стоит на центре контента рисунка и ходит внутри него.
 *
 * @param {object} params
 * @param {number} params.viewportWidth ширина вьюпорта, px
 * @param {number} params.viewportHeight высота вьюпорта, px
 * @param {number} [params.imageWidth] натуральная ширина картинки, px
 * @param {number} [params.imageHeight] натуральная высота картинки, px
 * @param {{ left: number, right: number }} [params.content] границы контента (`contentBounds`)
 * @param {number} [params.offset] положение вкладки: -1 первая, 0 середина, +1 последняя
 * @returns {{ width: number, height: number, left: number, top: number, shiftX: number }}
 */
export function backgroundLayout({
  viewportWidth,
  viewportHeight,
  imageWidth,
  imageHeight,
  content,
  offset = 0,
}) {
  const vw = Number(viewportWidth)
  const vh = Number(viewportHeight)
  const iw = Number(imageWidth)
  const ih = Number(imageHeight)
  const position = Number.isFinite(Number(offset)) ? Number(offset) : 0

  const still = { width: 0, height: 0, left: 0, top: 0, shiftX: 0 }

  if (!(vw > 0) || !(vh > 0) || !(iw > 0) || !(ih > 0)) return still

  // `cover`: картинка закрывает экран целиком — по ширине или по высоте, что больше.
  const coverScale = Math.max(vw / iw, vh / ih)
  const coverWidth = iw * coverScale
  const coverHeight = ih * coverScale

  // Границы контента: доли → px. Мусор и отсутствие данных = весь кадр.
  const rawLeft = clamp01(content?.left)
  const rawRight = clamp01(content?.right ?? 1)
  const share = rawRight > rawLeft ? rawRight - rawLeft : 1
  const contentShare = rawRight > rawLeft ? rawLeft : 0

  // Сколько места есть для хода внутри контента (окно обязано остаться в его границах).
  const minRoom = (BACKGROUND_SHIFT_MIN / 100) * vw
  const contentRoom = Math.max(0, (share * coverWidth - vw) / 2)

  // Своего запаса нет (контент ровно в ширину экрана) — минимальное увеличение, ровно чтобы
  // ход появился: края кадра и так уходят за экран, а движения без запаса не бывает.
  const scale = contentRoom >= minRoom ? 1 : Math.max(1, (vw + 2 * minRoom) / (share * coverWidth))

  const width = coverWidth * scale
  const height = coverHeight * scale

  // Центр окна — центр контента, но так, чтобы картинка всё равно закрывала экран.
  const contentCenter = (contentShare + share / 2) * width
  const center = clamp(contentCenter, vw / 2, width - vw / 2)
  const imageRoom = Math.max(0, Math.min(center - vw / 2, width - vw / 2 - center))

  const amplitude = Math.min(
    (BACKGROUND_SHIFT_MAX / 100) * vw,
    Math.max(0, (share * width - vw) / 2) * BACKGROUND_CONTENT_INSET,
    imageRoom,
  )

  return {
    width: round2(width),
    height: round2(height),
    left: round2(vw / 2 - center),
    top: round2((vh - height) / 2),
    shiftX: round2(-position * amplitude),
  }
}

/** Имя CSS-перехода для смены раздела: входящая страница приходит со стороны свайпа. */
export function swipeTransitionName(previousIndex, nextIndex) {
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) return ''
  return nextIndex > previousIndex ? 'lc-swipe-next' : 'lc-swipe-prev'
}
