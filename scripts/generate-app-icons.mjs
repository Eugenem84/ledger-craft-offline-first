#!/usr/bin/env node
// scripts/generate-app-icons.mjs
//
// Иконка приложения (задача 13.19): рисуется **кодом**, без картинок-исходников и без
// новых зависимостей (как `pull-feedback.mjs`). Так иконка живёт в репозитории: геометрия
// и палитра описаны ниже, а `npm run icons:generate` раскладывает все размеры, которые
// ждёт Android.
//
// Почему не готовый PNG из редактора: у проекта нет дизайн-исходников, а иконку нужно
// уметь пересобрать на любой машине (`npx cap sync android` её не трогает). Знак —
// «карточка учёта с галочкой»: лист-список и подтверждение; нишам не противоречит
// (веломастер, аквариумист, электрик — у всех есть работы и товары).
//
// Что получается:
//   • `mipmap-<density>/ic_launcher.png` и `ic_launcher_round.png` — legacy (Android < 8):
//     тёмный скруглённый квадрат / круг со знаком;
//   • `mipmap-<density>/ic_launcher_foreground.png` — слой адаптивной иконки (Android 8+),
//     холст 108dp, знак внутри safe zone 66dp; вырез под галочкой прозрачный, поэтому
//     видно фон-градиент из `drawable/ic_launcher_background.xml`;
//   • `mipmap-<density>/ic_launcher_monochrome.png` — слой для тематических иконок
//     (Android 13+): белый знак на прозрачном, цвет система подбирает сама;
//   • `src-capacitor/resources/icon*.png` — мастера 1024px (на случай правки в редакторе
//     или перехода на `@capacitor/assets`).
//
// Палитра — из `src/css/quasar.variables.scss`: фон-«цех» (`$dark-page`/`$dark`) и
// брендовый жёлтый `$secondary` (#ffeb3b) — он в приложении отвечает за интерактив.
//
// ⚠️ Иконка — это **нативные ресурсы Android**: OTA-бандл их не привезёт, нужен APK.
// А если после генерации изменился **набор** файлов (файл добавился или удалился, как
// `values/ic_launcher_background.xml` → `drawable/ic_launcher_background.xml`), перед сборкой
// нужен `./gradlew clean` в `src-capacitor/android`: инкрементальный merge ресурсов AGP
// падает внутренней ошибкой «In DataSet 'main', no data file for changedFile».
//
// Запуск: `npm run icons:generate`.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RES_DIR = path.join(root, 'src-capacitor/android/app/src/main/res')
const MASTER_DIR = path.join(root, 'src-capacitor/resources')

// ─── Палитра ─────────────────────────────────────────────────────────────────
/** Фон иконки: тот же «цех», что в приложении — от приподнятого тёмного к чёрному. */
export const BACKGROUND_TOP = [0x1a, 0x1a, 0x1a, 255]
export const BACKGROUND_BOTTOM = [0x00, 0x00, 0x00, 255]
/** Брендовый жёлтый (`$secondary`), он же акцент интерфейса. */
export const MARK_COLOR = [0xff, 0xeb, 0x3b, 255]

// ─── Геометрия знака (единый «холст» 108×108 — как у адаптивной иконки) ──────
/** Размер холста: у адаптивной иконки он 108dp, поэтому вся геометрия в этих единицах. */
export const CANVAS = 108
/** Safe zone адаптивной иконки: круг Ø66dp по центру — знак обязан в него уложиться. */
export const SAFE_ZONE = 66

/** Лист-карточка: `stroke` — толщина контура, `radius` — скругление углов. */
export const CARD = { x1: 30, y1: 35, x2: 62, y2: 75, radius: 8, stroke: 5.5 }
/** Строки «списка» внутри карточки: первая длинная, вторая короткая (как в чек-листе). */
export const BARS = [
  { x1: 38, y1: 46, x2: 54, y2: 46, stroke: 5 },
  { x1: 38, y1: 56, x2: 46, y2: 56, stroke: 5 },
]
/**
 * Галочка «принято/выполнено»: локтем попадает в правый нижний угол карточки и **подрезает**
 * её контур (см. `markSample`), а длинное плечо уходит вверх-вправо — знак читается как одно
 * целое, «работа принята», и не спорит со строками списка.
 */
export const CHECK = {
  points: [
    [54, 65],
    [61, 72],
    [77, 50],
  ],
  stroke: 7,
  /** Насколько широко галочка «вырезает» то, что под ней (полуширина выреза, px). */
  halo: 3.5,
}

// ─── Математика знака ────────────────────────────────────────────────────────
/** Расстояние от точки до отрезка: круглая линия (как `stroke-linecap: round`). */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Знаковое расстояние до скруглённого прямоугольника (SDF): `< 0` — внутри. */
function distanceToRoundedRect(px, py, rect) {
  const centerX = (rect.x1 + rect.x2) / 2
  const centerY = (rect.y1 + rect.y2) / 2
  const halfX = (rect.x2 - rect.x1) / 2 - rect.radius
  const halfY = (rect.y2 - rect.y1) / 2 - rect.radius
  const dx = Math.abs(px - centerX) - halfX
  const dy = Math.abs(py - centerY) - halfY

  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rect.radius
}

/** Ломаная-«галочка»: круглая линия (края и излом скруглены). */
function hitsPolyline(px, py, points, halfWidth) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, ay] = points[index]
    const [bx, by] = points[index + 1]

    if (distanceToSegment(px, py, ax, ay, bx, by) <= halfWidth) return true
  }

  return false
}

const hitsCard = (px, py) => Math.abs(distanceToRoundedRect(px, py, CARD)) <= CARD.stroke / 2
const hitsBars = (px, py) =>
  BARS.some(bar => distanceToSegment(px, py, bar.x1, bar.y1, bar.x2, bar.y2) <= bar.stroke / 2)
const hitsCheck = (px, py) => hitsPolyline(px, py, CHECK.points, CHECK.stroke / 2)
const hitsCheckHalo = (px, py) => hitsPolyline(px, py, CHECK.points, CHECK.stroke / 2 + CHECK.halo)

/**
 * Что в точке холста (координаты 108×108): `true` — жёлтый знак, `false` — прозрачно.
 *
 * Порядок важен: галочка рисуется **поверх** всего, а её «вырез» (`halo`) убирает то,
 * что под ней, — включая контур карточки и строки списка. Для слоя адаптивной иконки
 * вырез прозрачный, поэтому сквозь него видно фон-градиент.
 */
export function markSample(px, py) {
  if (hitsCheck(px, py)) return true
  if (hitsCheckHalo(px, py)) return false
  if (hitsCard(px, py) || hitsBars(px, py)) return true

  return false
}

/** Цвет фона иконки в точке холста: вертикальный градиент «тёмный → чёрный». */
export function backgroundColor(py) {
  const t = Math.max(0, Math.min(1, py / CANVAS))

  return BACKGROUND_TOP.map((channel, index) =>
    Math.round(channel + (BACKGROUND_BOTTOM[index] - channel) * t)
  )
}


// ─── Растеризация ────────────────────────────────────────────────────────────
/** Сколько подвыборок на пиксель: 4×4 — гладкие края без «лестницы». */
export const SUBSAMPLES = 4

/**
 * Рисует холст `size×size` по функции `pixel(u, v)`, где `u`,`v` — координаты 108-пространства,
 * а функция возвращает `[r, g, b, a]` или `null` (прозрачно). Пиксель усредняется по
 * подвыборкам в премультиплицированном виде — так края знака не «светлеют» на прозрачном.
 */
export function renderCanvas(size, pixel) {
  const data = Buffer.alloc(size * size * 4)
  const step = CANVAS / size
  // У мастеров 1024px подвыборок меньше: на глаз не видно, а времени вчетверо меньше.
  const subsamples = size > 512 ? 2 : SUBSAMPLES
  const samples = subsamples * subsamples

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let alpha = 0

      for (let sy = 0; sy < subsamples; sy += 1) {
        for (let sx = 0; sx < subsamples; sx += 1) {
          const u = (x + (sx + 0.5) / subsamples) * step
          const v = (y + (sy + 0.5) / subsamples) * step
          const color = pixel(u, v)

          if (!color) continue

          const coverage = color[3] / 255

          red += color[0] * coverage
          green += color[1] * coverage
          blue += color[2] * coverage
          alpha += coverage
        }
      }

      const offset = (y * size + x) * 4
      const averageAlpha = alpha / samples

      data[offset] = averageAlpha === 0 ? 0 : Math.round(red / samples / averageAlpha)
      data[offset + 1] = averageAlpha === 0 ? 0 : Math.round(green / samples / averageAlpha)
      data[offset + 2] = averageAlpha === 0 ? 0 : Math.round(blue / samples / averageAlpha)
      data[offset + 3] = Math.round(averageAlpha * 255)
    }
  }

  return data
}

/** Слой адаптивной иконки: только знак, всё остальное прозрачно (фон даёт система). */
export function renderAdaptiveLayer(size, { monochrome = false } = {}) {
  const color = monochrome ? [255, 255, 255, 255] : MARK_COLOR

  return renderCanvas(size, (u, v) => (markSample(u, v) ? color : null))
}

/**
 * Legacy-иконка (Android < 8): фон — скруглённый квадрат или круг — плюс знак,
 * увеличенный на `zoom` (у круглой иконки срезаны углы, поэтому `zoom` меньше).
 */
export function renderLegacyIcon(size, { round = false, zoom = 1.26 } = {}) {
  const square = { x1: 0, y1: 0, x2: CANVAS, y2: CANVAS, radius: 24 }
  const center = CANVAS / 2

  return renderCanvas(size, (u, v) => {
    const inside = round
      ? Math.hypot(u - center, v - center) <= center
      : distanceToRoundedRect(u, v, square) <= 0

    if (!inside) return null

    const markU = center + (u - center) / zoom
    const markV = center + (v - center) / zoom

    return markSample(markU, markV) ? MARK_COLOR : backgroundColor(v)
  })
}


// ─── PNG (без зависимостей) ───────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }

  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)

  return Buffer.concat([length, body, crc])
}

/** Кодирует RGBA-буфер в PNG (8 бит на канал, без интерлейса). */
export function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // фильтр «none»
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // бит на канал
  header[9] = 6 // цветовой тип: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── Что и куда пишем ────────────────────────────────────────────────────────
/** Плотности Android: `legacy` — сторона legacy-иконки, `adaptive` — холст 108dp в px. */
export const DENSITIES = [
  { dir: 'mipmap-mdpi', legacy: 48, adaptive: 108 },
  { dir: 'mipmap-hdpi', legacy: 72, adaptive: 162 },
  { dir: 'mipmap-xhdpi', legacy: 96, adaptive: 216 },
  { dir: 'mipmap-xxhdpi', legacy: 144, adaptive: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, adaptive: 432 },
]

const hexColor = color => color.slice(0, 3).map(channel => channel.toString(16).padStart(2, '0')).join('')

const ADAPTIVE_ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Адаптивная иконка (Android 8+), задача 13.14. Слои: фон-градиент, знак и монохромный
     вариант для тематических иконок (Android 13+). Файлы рисует \`npm run icons:generate\` —
     руками не правим (при следующем запуске перезапишутся). -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`

const BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Фон адаптивной иконки: «цех» как в приложении — приподнятый тёмный сверху, чёрный снизу
     (те же цвета, что поверхности интерфейса). Рисуется кодом: \`npm run icons:generate\`. -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:angle="270"
        android:startColor="#${hexColor(BACKGROUND_TOP)}"
        android:endColor="#${hexColor(BACKGROUND_BOTTOM)}" />
</shape>
`

/**
 * XML-комментарий не может содержать `--` (частая грабля: в текст заглядывают имена
 * CSS-переменных `--lc-*`). Такая ошибка ловится только сборкой Android, поэтому проверяем
 * её здесь: генератор падает сразу, а не на `mergeReleaseResources` через минуту.
 */
export function assertXmlCommentsAreValid(xml, fileName) {
  for (const match of xml.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (match[1].includes('--')) {
      throw new Error(`${fileName}: в XML-комментарии нельзя использовать «--»: ${match[1].trim()}`)
    }
  }

  return xml
}

export async function main() {
  const written = []

  for (const { dir, legacy, adaptive } of DENSITIES) {
    const target = path.join(RES_DIR, dir)

    await mkdir(target, { recursive: true })

    const files = [
      ['ic_launcher.png', legacy, renderLegacyIcon(legacy)],
      ['ic_launcher_round.png', legacy, renderLegacyIcon(legacy, { round: true, zoom: 1.12 })],
      ['ic_launcher_foreground.png', adaptive, renderAdaptiveLayer(adaptive)],
      ['ic_launcher_monochrome.png', adaptive, renderAdaptiveLayer(adaptive, { monochrome: true })],
    ]

    for (const [name, size, pixels] of files) {
      await writeFile(path.join(target, name), encodePng(size, size, pixels))
      written.push(`${dir}/${name}`)
    }
  }

  await mkdir(path.join(RES_DIR, 'drawable'), { recursive: true })
  await writeFile(
    path.join(RES_DIR, 'drawable/ic_launcher_background.xml'),
    assertXmlCommentsAreValid(BACKGROUND_XML, 'drawable/ic_launcher_background.xml')
  )
  written.push('drawable/ic_launcher_background.xml')

  const adaptiveXml = assertXmlCommentsAreValid(ADAPTIVE_ICON_XML, 'mipmap-anydpi-v26/ic_launcher.xml')

  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    await writeFile(path.join(RES_DIR, 'mipmap-anydpi-v26', name), adaptiveXml)
    written.push(`mipmap-anydpi-v26/${name}`)
  }

  // Цвет-заглушка из шаблона Capacitor (`#FFFFFF`) больше не нужен: фон задаёт drawable.
  await rm(path.join(RES_DIR, 'values/ic_launcher_background.xml'), { force: true })

  await mkdir(MASTER_DIR, { recursive: true })

  const masters = [
    ['icon.png', renderLegacyIcon(1024)],
    ['icon-round.png', renderLegacyIcon(1024, { round: true, zoom: 1.12 })],
    ['icon-foreground.png', renderAdaptiveLayer(1024)],
    ['icon-background.png', renderCanvas(1024, (u, v) => backgroundColor(v))],
  ]

  for (const [name, pixels] of masters) {
    await writeFile(path.join(MASTER_DIR, name), encodePng(1024, 1024, pixels))
    written.push(`resources/${name}`)
  }

  console.log(`Готово: ${written.length} файлов иконки`)
  for (const file of written) console.log(`  ${file}`)
}

/**
 * Запуск только при прямом вызове (`npm run icons:generate`): модуль импортируют тесты
 * (`test/app-icon.test.js`) ради геометрии и растеризации — без побочной записи файлов.
 */
const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch(error => {
    console.error(`[icons:generate] ${error?.message || error}`)
    process.exitCode = 1
  })
}

