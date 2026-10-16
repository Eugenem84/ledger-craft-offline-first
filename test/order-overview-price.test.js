// test/order-overview-price.test.js
//
// Живой отчёт мастера 16.10.2026 (**боевой** контур, предложение — задача 14.34):
// «Из вкладки заказа обзор надо чтобы была возможность редактировать стоимость работ и
// запчастей».
//
// До правки «обзор» по цене был экраном только для чтения: строки работ показывали цену
// текстом, а список «товары» и вовсе не имел режима правки (он включался только на вкладке
// «товары», `OrderPartsEditor`). Теперь цена — поле ввода в режиме правки, а событие уходит
// тем же путём, что и количество: строка → стор черновика → БД по «Сохранить».
//
// Тесты: структурные (контракт компонентов, как `order-quantity-editmode.test.js`) плюс
// проверка самого стора черновика — цена живёт в черновике и пересчитывает итог сразу.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('14.34 стоимость работ и товаров правится из «обзора»', () => {
  it('работы: цена — поле ввода только в режиме правки', () => {
    const block = read('src/components/order/OrderServicesBlock.vue')

    expect(block).toMatch(/<q-input\s+v-if="props\.editMode"[\s\S]*?type="number"/)
    expect(block).toContain("emit('update-line', { index, field: 'price', value })")
    // Просмотр остаётся чтением: цена печатается деньгами.
    expect(block).toMatch(/<span v-else class="lc-money">/)
  })

  it('товары: у блока появился режим правки и правка цены по источнику строки', () => {
    const block = read('src/components/order/OrderPartsBlock.vue')

    expect(block).toContain('editMode: { type: Boolean, default: false }')
    expect(block).toMatch(/<q-input\s+v-if="props\.editMode"[\s\S]*?type="number"/)
    expect(block).toContain(
      "emit('update-line', { source: part.source, index: part.index, field: 'price', value })"
    )
  })

  it('панель «обзор» пробрасывает режим правки и событие цены товаров', () => {
    const panel = read('src/components/order/OrderOverviewPanel.vue')
    const start = panel.indexOf('<OrderPartsBlock')
    const tag = panel.slice(start, panel.indexOf('/>', start))

    expect(start).toBeGreaterThan(-1)
    expect(tag).toContain(':edit-mode="props.editMode"')
    expect(tag).toContain("emit('update-part-line', payload)")
    expect(panel).toContain("'update-part-line',")
  })

  it('страница заказа ведёт правку цены товаров в стор черновика', () => {
    const page = read('src/pages/OrderDetailsPage.vue')
    const start = page.indexOf('<OrderOverviewPanel')
    const tag = page.slice(start, page.indexOf('/>', start))

    expect(start).toBeGreaterThan(-1)
    expect(tag).toContain(':edit-mode="editMode"')
    expect(tag).toContain('@update-part-line="draft.updatePartLine($event)"')
    expect(tag).toContain('@update-service-line=')
  })
})

describe('14.34 стор черновика: цена меняется и сразу пересчитывает итоги', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('цена работы уезжает в черновик и в сумму по работам', () => {
    const draft = useOrderDraftStore()
    draft.services.push({ id: 's-1', service: 'подкачать колесо', price: 100, quantity: 2 })

    draft.updateServiceLine(0, 'price', 150)

    expect(draft.services[0].price).toBe(150)
    expect(draft.servicesTotal).toBe(300)
  })

  it('цена товара со склада и разовой покупки правится по источнику строки', () => {
    const draft = useOrderDraftStore()
    draft.products.push({
      id: 'p-1',
      product_id: 'p-1',
      name: 'камера 26"',
      price: 500,
      amount: 2,
      buy_price: 300,
    })
    draft.materials.push({ id: 'm-1', name: 'масло', price: 200, amount: 1 })

    draft.updatePartLine({ source: 'store', index: 0, field: 'price', value: 600 })
    draft.updatePartLine({ source: 'purchase', index: 0, field: 'price', value: 250 })

    expect(draft.products[0].price).toBe(600)
    expect(draft.materials[0].price).toBe(250)
    expect(draft.productsTotal).toBe(1200)
    expect(draft.materialsTotal).toBe(250)
    expect(draft.totalAmount).toBe(1450)
  })
})
