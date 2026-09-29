// test/order-parts.test.js
//
// Правка владельца (29.09.2026) по отчёту мастера с **боевого** контура («надо объединить
// товары и материалы — путаница»): вкладка заказа показывает **один список** «товары», где
// строка помнит источник — товар со склада (`store`) или разовая покупка вне склада
// (`purchase`). Модель данных не меняется (решение D2): под капотом по-прежнему `products`
// (склад) и `materials` (покупки).
//
// Тест гоняет геттер `parts` и экшены `removePart`/`updatePartLine` на состоянии стора
// (без БД): важно, что строка адресуется к правильному массиву по `source`.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'

describe('товары: единый список склада и покупок (отчёт 29.09.2026)', () => {
  let draft

  beforeEach(() => {
    setActivePinia(createPinia())
    draft = useOrderDraftStore()
    draft.products = [{ id: 'p1', name: 'Камера', price: 500, amount: 1, buy_price: 300 }]
    draft.materials = [{ id: 'm1', name: 'Герметик', price: 50, amount: 2, buy_price: null }]
  })

  it('склад и покупки идут одним списком с тегом источника и индексом в своём массиве', () => {
    expect(draft.parts).toHaveLength(2)
    expect(draft.parts[0]).toMatchObject({ id: 'p1', source: 'store', index: 0 })
    expect(draft.parts[1]).toMatchObject({ id: 'm1', source: 'purchase', index: 0 })
  })

  it('removePart адресует удаление к нужному массиву по source', () => {
    draft.removePart({ source: 'store', index: 0 })
    expect(draft.products).toHaveLength(0)
    expect(draft.materials).toHaveLength(1)

    draft.removePart({ source: 'purchase', index: 0 })
    expect(draft.materials).toHaveLength(0)
  })

  it('updatePartLine правит строку в нужном массиве по source', () => {
    draft.updatePartLine({ source: 'store', index: 0, field: 'price', value: 800 })
    draft.updatePartLine({ source: 'purchase', index: 0, field: 'amount', value: 3 })

    expect(draft.products[0].price).toBe(800)
    expect(draft.materials[0].amount).toBe(3)
  })

  it('итог «товары» = склад + покупки', () => {
    expect(draft.productsTotal).toBe(500)
    expect(draft.materialsTotal).toBe(100)
  })
})
