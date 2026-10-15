// test/app-icon.test.js
//
// Иконка приложения (задача 13.19). Иконку рисует код (`scripts/generate-app-icons.mjs`),
// поэтому проверяем не «картинка похожа», а контракт: размеры под все плотности Android,
// слои адаптивной иконки, брендовый цвет из палитры и — главное — что знак укладывается
// в видимую область адаптивной иконки (иначе углы срежет маска лаунчера).
//
// Файлы читаются с диска: тесты фиксируют **результат** генератора, поэтому прогонять
// `npm run icons:generate` нужно до тестов (в релизе это отдельный шаг, см. README).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  CANVAS,
  DENSITIES,
  MARK_COLOR,
  SAFE_ZONE,
  assertXmlCommentsAreValid,
  encodePng,
  markSample,
  renderAdaptiveLayer,
} from '../scripts/generate-app-icons.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')
const RES = 'src-capacitor/android/app/src/main/res'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Размеры PNG — прямо из заголовка IHDR: библиотеки для картинок в тестах не нужны. */
function pngSize(relative) {
  const data = readFileSync(path.join(root, relative))

  expect([...data.subarray(0, 8)]).toEqual(PNG_SIGNATURE)

  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

/** Габариты, «центр тяжести» и площадь знака в координатах холста 108×108. */
function markBounds() {
  const step = 0.25
  const bounds = { minX: CANVAS, minY: CANVAS, maxX: 0, maxY: 0, maxRadius: 0, coverage: 0 }

  for (let v = 0; v <= CANVAS; v += step) {
    for (let u = 0; u <= CANVAS; u += step) {
      if (!markSample(u, v)) continue

      bounds.minX = Math.min(bounds.minX, u)
      bounds.maxX = Math.max(bounds.maxX, u)
      bounds.minY = Math.min(bounds.minY, v)
      bounds.maxY = Math.max(bounds.maxY, v)
      bounds.maxRadius = Math.max(bounds.maxRadius, Math.hypot(u - CANVAS / 2, v - CANVAS / 2))
      bounds.coverage += step * step
    }
  }

  bounds.coverage /= CANVAS * CANVAS

  return bounds
}

const hex = color => `#${color.slice(0, 3).map(c => c.toString(16).padStart(2, '0')).join('')}`

describe('13.19 иконка приложения', () => {
  it('все плотности Android на месте и нужного размера', () => {
    for (const { dir, legacy, adaptive } of DENSITIES) {
      expect(pngSize(`${RES}/${dir}/ic_launcher.png`)).toEqual({ width: legacy, height: legacy })
      expect(pngSize(`${RES}/${dir}/ic_launcher_round.png`)).toEqual({ width: legacy, height: legacy })
      expect(pngSize(`${RES}/${dir}/ic_launcher_foreground.png`)).toEqual({
        width: adaptive,
        height: adaptive,
      })
      expect(pngSize(`${RES}/${dir}/ic_launcher_monochrome.png`)).toEqual({
        width: adaptive,
        height: adaptive,
      })
    }
  })

  it('адаптивная иконка ссылается на фон, знак и монохромный слой (Android 13+)', () => {
    for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const xml = read(`${RES}/mipmap-anydpi-v26/${name}`)

      expect(xml).toContain('@drawable/ic_launcher_background')
      expect(xml).toContain('@mipmap/ic_launcher_foreground')
      expect(xml).toContain('<monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>')
    }
  })

  it('фон — тёмный градиент «цех», а не белая заглушка шаблона Capacitor', () => {
    const background = read(`${RES}/drawable/ic_launcher_background.xml`)

    expect(background).toContain('android:angle="270"')
    expect(background).toContain('#1a1a1a')
    expect(background).toContain('#000000')
    // Белую заглушку шаблона генератор удаляет — иначе иконка осталась бы «пустой».
    expect(existsSync(path.join(root, `${RES}/values/ic_launcher_background.xml`))).toBe(false)
  })

  it('знак укладывается в видимую область адаптивной иконки и стоит по центру', () => {
    const bounds = markBounds()

    // Видимая часть адаптивной иконки — центральные 72dp (радиус 36): что дальше, срежет
    // маска лаунчера. Safe zone 66dp — более строгий ориентир для круглых масок.
    expect(SAFE_ZONE).toBe(66)
    expect(bounds.maxRadius).toBeLessThanOrEqual(36)

    expect(Math.abs((bounds.minX + bounds.maxX) / 2 - CANVAS / 2)).toBeLessThanOrEqual(2)
    expect(Math.abs((bounds.minY + bounds.maxY) / 2 - CANVAS / 2)).toBeLessThanOrEqual(2)

    // Знак заметный, но не «жёлтый квадрат»: от 5% до 35% площади холста.
    expect(bounds.coverage).toBeGreaterThan(0.05)
    expect(bounds.coverage).toBeLessThan(0.35)
  })

  it('жёлтый знака — тот же `$secondary`, что в палитре приложения', () => {
    const scss = read('src/css/quasar.variables.scss')
    const secondary = /\$secondary:\s*(#[0-9a-fA-F]{6})/.exec(scss)[1]

    expect(hex(MARK_COLOR)).toBe(secondary.toLowerCase())
  })

  it('растеризация: знак непрозрачный и жёлтый, вокруг — прозрачно', () => {
    const size = 108
    const layer = renderAdaptiveLayer(size)
    const at = (buffer, u, v) => {
      const offset = (Math.floor(v) * size + Math.floor(u)) * 4

      return [buffer[offset], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3]]
    }

    // Верхняя кромка карточки (контур толщиной 5.5 вокруг y = 35) — чистый жёлтый.
    expect(at(layer, 46, 35)).toEqual(MARK_COLOR)
    // Угол холста — прозрачный: слой адаптивной иконки без фона.
    expect(at(layer, 2, 2)).toEqual([0, 0, 0, 0])

    // Монохромный слой — тот же силуэт, но белым (цвет система подберёт сама).
    const monochrome = renderAdaptiveLayer(size, { monochrome: true })
    const mono = at(monochrome, 46, 35)

    expect(mono).toEqual([255, 255, 255, layer[(35 * size + 46) * 4 + 3]])
  })

  it('PNG-кодек: валидная подпись и размеры в заголовке', () => {
    const png = encodePng(2, 3, Buffer.alloc(2 * 3 * 4, 0xff))

    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(3)
  })

  it('в XML-комментариях нет «--»: Android не собирается с такой ошибкой', () => {
    for (const file of [
      `${RES}/drawable/ic_launcher_background.xml`,
      `${RES}/mipmap-anydpi-v26/ic_launcher.xml`,
      `${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`,
    ]) {
      expect(() => assertXmlCommentsAreValid(read(file), file)).not.toThrow()
    }

    // Сам сторож ловит грабли: `--lc-surface` внутри комментария = невалидный XML.
    expect(() => assertXmlCommentsAreValid('<!-- см. `--lc-bg` -->', 'bad.xml')).toThrow(/нельзя/)
  })

  it('генератор вызывается скриптом npm и не пишет файлы при импорте', () => {
    expect(read('package.json')).toContain('"icons:generate": "node scripts/generate-app-icons.mjs"')
    expect(existsSync(path.join(root, 'scripts/generate-app-icons.mjs'))).toBe(true)
  })
})

