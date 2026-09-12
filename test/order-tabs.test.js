// test/order-tabs.test.js
//
// Регресс-тест на контракт Quasar: `QTabPanels` собирает список панелей из ПРЯМЫХ
// vnode'ов своего слота и сверяет их проп `name` (`use-panel.js` → `updatePanelsList`),
// а затем рендерит ровно одну панель (`getPanelContent()` → `panels[panelIndex]`).
//
// Если панель обёрнута в свой компонент, у которого нет пропа `name`, список панелей
// оказывается пустым и **содержимое всех вкладок не отрисовывается вообще** — при
// этом вкладки видны, и дефект выглядит как «под вкладкой ничего нет».
//
// Именно так и было в карточке заказа: панели лежали внутри `OrderOverviewPanel`,
// `OrderServicesPanel` и `OrderMaterialsPanel` вместо прямых детей `q-tab-panels`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

const PAGE = 'src/pages/OrderDetailsPage.vue'

/** Компоненты содержимого вкладок: они не должны изображать из себя панели. */
const PANEL_CONTENT_COMPONENTS = [
  'src/components/order/OrderOverviewPanel.vue',
  'src/components/order/OrderServicesPanel.vue',
  'src/components/order/OrderMaterialsPanel.vue',
]

/** Имена вкладок: `<q-tab name="...">` (но не `<q-tab-panel…>` / `<q-tab-panels…>`). */
function tabNames(source) {
  return [...source.matchAll(/<q-tab\s[^>]*name="([^"]+)"/g)].map(match => match[1])
}

/** Имена панелей: `<q-tab-panel name="...">`. */
function panelNames(source) {
  return [...source.matchAll(/<q-tab-panel\s[^>]*name="([^"]+)"/g)].map(match => match[1])
}

describe('карточка заказа: панели вкладок объявлены прямыми детьми q-tab-panels', () => {
  const page = read(PAGE)

  it('у каждой вкладки есть панель с тем же именем', () => {
    const tabs = tabNames(page)

    expect(tabs.length).toBeGreaterThan(2)
    expect(new Set(tabs)).toEqual(new Set(panelNames(page)))
  })

  it('все панели объявлены внутри q-tab-panels на самой странице', () => {
    const start = page.indexOf('<q-tab-panels')
    const end = page.indexOf('</q-tab-panels>')

    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const block = page.slice(start, end)

    for (const name of tabNames(page)) {
      expect(block).toContain(`<q-tab-panel name="${name}"`)
    }
  })

  it.each(PANEL_CONTENT_COMPONENTS)('%s: содержимое без корневого q-tab-panel', file => {
    const source = read(file)

    expect(
      source.includes('<q-tab-panel'),
      `${file}: QTabPanels видит только прямых детей с пропом \`name\`, поэтому корневой ` +
        '`q-tab-panel` внутри обёртки не сработает — содержимое вкладки не отрисуется. ' +
        'Объявите `q-tab-panel` в OrderDetailsPage.vue, а здесь оставьте обычный `<div>`.'
    ).toBe(false)
  })
})
