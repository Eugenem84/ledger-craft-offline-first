// test/store-movements-ui.test.js
//
// Правки владельца 15.09.2026 вокруг склада и подсказок:
//
//   1. «сам склад вообще оставить как есть, просто внутри разделить на две вкладки:
//      "товары" … и плюс вкладка движение по складу … там новый функционал для просмотра
//      истории движения по складу и редактирование»;
//   2. «проследить, чтобы при увеличении списка не вылезало окно за пределы экрана»;
//   3. подсказка «добавить работы/материалы/товары можно на вкладках выше» — только
//      для пустого заказа;
//   4. «историю приходов тоже должна быть возможность редактировать».
//
// Тесты структурные (как `order-tabs.test.js`, `pages-layout.test.js`): контракт
// компонентов ломается здесь, а не на живом прогоне у мастера. Логика правки прихода
// проверяется на настоящей БД в `test/stock-history.test.js`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatDayLabel } from 'src/utils/formatDate.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('склад: вкладки «товары» и «движение товаров»', () => {
  it('StorePage делит раздел на две вкладки, товары остаются как были', () => {
    const page = read('src/pages/StorePage.vue')

    expect(page).toContain('<q-tab-panel name="goods"')
    expect(page).toContain('<q-tab-panel name="movements"')
    expect(page).toContain('label="движение товаров"')
    // Вкладка «товары» — прежний склад: категория товара, список, кнопка создания.
    expect(page).toContain('категория товара')
    expect(page).toContain('<StoreHistoryPanel')
    // Плавающая кнопка создания нужна только на вкладке товаров.
    expect(page).toMatch(/<LcFab\s+v-if="tab === 'goods'"/)
  })

  it('вкладка истории: фильтр, обновление и правка прихода', () => {
    const panel = read('src/components/store/StoreHistoryPanel.vue')

    expect(panel).toContain('useStockHistoryStore')
    expect(panel).toContain('loadAll(')
    expect(panel).toContain('<StockMovementsList')
    expect(panel).toContain('<EditArrivalDialogPage')
    // После правки прихода страница обновляет список товаров.
    expect(panel).toContain("emit('changed')")
  })

  it('строки истории: приход «+», расход «−», правка — только у прихода', () => {
    const list = read('src/components/store/StockMovementsList.vue')

    expect(list).toContain("movement.kind === 'in' ? '+' : '−'")
    expect(list).toContain("v-if=\"movement.kind === 'in'\"")
    expect(list).toContain("emit('edit', movement)")
    expect(list).toContain('formatDayLabel')
  })

  it('диалог правки прихода: количество шагомером, у синхронизированного — заблокировано', () => {
    const dialog = read('src/pages/dialogs/EditArrivalDialogPage.vue')

    expect(dialog).toContain('useProductsStore')
    expect(dialog).toContain('updateArrival(')
    expect(dialog).toContain('<LcQuantityStepper')
    expect(dialog).toContain('const quantityEditable = computed(() => !current.value?.synced)')
    expect(dialog).toContain(':disable="!quantityEditable"')
    expect(dialog).toContain('label="Цена закупки, р"')
  })

  it('карточка товара переиспользует строки истории и тоже умеет править приход', () => {
    const card = read('src/pages/dialogs/ProductDialogPage.vue')

    expect(card).toContain('<StockMovementsList')
    expect(card).toContain(':show-product="false"')
    expect(card).toContain('<EditArrivalDialogPage')
    expect(card).toContain('@edit="openEditArrival"')
  })
})

describe('диалог не вылезает за пределы экрана', () => {
  it('высоту ограничивает вьюпорт, прокручивается только тело', () => {
    const shell = read('src/components/ui/LcDialogShell.vue')

    expect(shell).toContain('max-height: calc(100vh - 32px)')
    expect(shell).toContain('max-height: calc(100dvh - 32px)')
    expect(shell).toContain('flex-direction: column')
    expect(shell).toMatch(/\.lc-dialog__body \{[^}]*overflow: auto/)
    // Старое ограничение «65vh» больше не единственная защита от переполнения.
    expect(shell).not.toContain('max-height: 65vh')
  })
})

describe('подсказка «добавить можно на вкладках выше» — только для пустого заказа', () => {
  it('панель обзора гасит подсказку, как только появились позиции', () => {
    const panel = read('src/components/order/OrderOverviewPanel.vue')

    expect(panel).toContain('const hasPositions = computed(')
    expect(panel).toContain('v-if="!props.editMode && !hasPositions"')
  })
})

describe('подпись даты движения склада', () => {
  it('день и месяц, а год — только если он не текущий', () => {
    const now = new Date('2026-09-15T12:00:00')
    const seconds = value => Math.floor(value.getTime() / 1000)

    expect(formatDayLabel(seconds(new Date('2026-09-12T10:00:00')), now)).toBe('12 сентября')
    expect(formatDayLabel(seconds(new Date('2025-12-31T10:00:00')), now)).toBe('31 декабря 25')
    expect(formatDayLabel(0, now)).toBe('—')
    expect(formatDayLabel(null, now)).toBe('—')
    expect(formatDayLabel('мусор', now)).toBe('—')
  })
})
