// test/order-line-name-wrap.test.js
//
// Живой отчёт мастера 17.10.2026 (**боевой** контур, предложение — задача 14.35):
// «Сделать чтобы наименования товаров и работ были видны полностью. Можно в две строки».
//
// До правки имя строки печаталось классом `.ellipsis` из Quasar (одна строка + обрезка),
// поэтому длинные названия работ и товаров мастер не читал: различие было видно только
// в каталоге. Теперь имя занимает до двух строк, а числа и кнопки остаются в своих
// колонках (`.lc-linerow` центрирует их по вертикали).
//
// Тесты структурные (контракт разметки и общего стиля), как `order-overview-price.test.js`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

/** Классы ячейки имени строки: работы (`service.service`) и товары (`part.name`). */
function nameCellClasses(relative) {
  const match = read(relative).match(
    /<div class="([^"]*)">\{\{ (?:service\.service|part\.name) \}\}<\/div>/
  )

  return match ? match[1].split(/\s+/) : []
}

describe('14.35 наименования работ и товаров видны полностью — две строки', () => {
  it('работы: имя строки занимает две строки, а не обрезается в одну', () => {
    const classes = nameCellClasses('src/components/order/OrderServicesBlock.vue')

    expect(classes).toContain('lc-col-name--wrap')
    expect(classes).not.toContain('ellipsis')
  })

  it('товары: имя строки занимает две строки, а не обрезается в одну', () => {
    const classes = nameCellClasses('src/components/order/OrderPartsBlock.vue')

    expect(classes).toContain('lc-col-name--wrap')
    expect(classes).not.toContain('ellipsis')
  })

  it('общий стиль: двухстрочный кламп и перенос длинных слов', () => {
    const css = read('src/css/app.scss')
    const start = css.indexOf('.lc-col-name--wrap')
    const block = css.slice(start, css.indexOf('}', start))

    expect(start).toBeGreaterThan(-1)
    expect(block).toContain('-webkit-line-clamp: 2')
    expect(block).toContain('-webkit-box-orient: vertical')
    expect(block).toContain('overflow-wrap: anywhere')
  })
})
