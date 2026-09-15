// test/ui-buttons.test.js
//
// Правка владельца (15.09.2026): единый язык кнопок, цветов и списка заказов.
//   • кнопки: главное действие — заливка акцентом с тёмной подписью, второстепенное —
//     «чип» (мягкая заливка + тонкая рамка), тихое — плоская кнопка;
//   • палитра сведена к четырём ролям (акцент / «опасно» / «успех» / «внимание»):
//     значения берутся из токенов статусов, а не из палитровых пропсов по месту;
//   • список заказов: каждый заказ — отдельная карточка с отступом, полоса статуса
//     срезана по радиусу;
//   • сегментированные тумблеры вне карточки заказа (склад, «Аналитика») красятся
//     классом `.lc-seg`, палитровые пропсы Quasar из разметки убраны.
//
// UI проверяется структурно по исходникам `.vue`/`.scss` — в проекте нет
// @vue/test-utils (см. `test/order-tabs.test.js`).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

const css = read('src/css/app.scss')

describe('кнопки: роли цвета сведены к токенам статусов', () => {
  it('«опасно», «успех» и «внимание» — те же цвета, что у статусов', () => {
    // Палитра из четырёх цветов, а не из семи оттенков Quasar.
    expect(css).toContain('--lc-danger: var(--lc-process)')
    expect(css).toContain('--lc-danger-soft: var(--lc-process-soft)')
    expect(css).toContain('--lc-danger-line: var(--lc-process-line)')
    expect(css).toContain('--lc-ok: var(--lc-done)')
    expect(css).toContain('--lc-warn: var(--lc-waiting)')
  })

  it('палитровые классы Quasar переопределены централизованно', () => {
    expect(css).toContain('.text-secondary {')
    expect(css).toContain('.text-deep-orange')
    expect(css).toContain('color: var(--lc-danger) !important')
    expect(css).toContain('color: var(--lc-warn) !important')
  })
})

describe('кнопки: единый «чип»-язык (мягкая заливка + тонкое кольцо)', () => {
  it('цветная кнопка — «чип», а не сплошная плашка', () => {
    // «новый заказ», «новая работа», «добавить материал», кнопки обновления — тот же
    // вид, что у чипов статуса (правка владельца 15.09.2026).
    const filled = css.match(/\.q-btn\.bg-secondary:not\(\.lc-sync-chip--icon\)\s*\{[\s\S]{0,220}?\}/)
    expect(filled).toBeTruthy()
    expect(filled[0]).toContain('background: var(--lc-accent-soft) !important')
    expect(filled[0]).toContain('color: var(--lc-accent) !important')
    expect(filled[0]).toContain('inset 0 0 0 1px var(--lc-accent-border)')

    // Остальные роли — та же пара токенов (у «опасно» ещё и `deep-orange`).
    expect(css).toContain('.q-btn.bg-positive:not(.lc-sync-chip--icon)')
    expect(css).toContain('background: var(--lc-ok-soft) !important')
    expect(css).toContain('.q-btn.bg-negative:not(.lc-sync-chip--icon)')
    expect(css).toContain('background: var(--lc-danger-soft) !important')
    expect(css).toContain('.q-btn.bg-warning:not(.lc-sync-chip--icon)')
    expect(css).toContain('background: var(--lc-warn-soft) !important')

    // Свою тень Quasar («::before») у «чипа» выключаем: рамку рисует кольцо.
    expect(css).toMatch(/\.q-btn\.bg-warning:before\s*\{\s*box-shadow: none;/)
  })

  it('второстепенное действие — «чип»: мягкая заливка и тонкая рамка', () => {
    const block = css.match(/\.q-btn--outline\.text-secondary\s*\{[^}]*\}/)
    expect(block).toBeTruthy()
    expect(block[0]).toContain('background: var(--lc-accent-soft) !important')
    expect(block[0]).toContain('color: var(--lc-accent) !important')

    // Рамку рисует `::before` — её цвет тоже из токена (35 %), а не `currentColor`.
    expect(css).toContain('.q-btn--outline.text-secondary:before')
    expect(css).toContain('border-color: var(--lc-accent-border)')
  })

  it('опасное — «чип» из мягких токенов, без своего оттенка красного', () => {
    const filled = css.match(/\.q-btn\.bg-negative:not\(\.lc-sync-chip--icon\),[\s\S]{0,200}?\}/)
    expect(filled).toBeTruthy()
    expect(filled[0]).toContain('background: var(--lc-danger-soft) !important')

    const outline = css.match(/\.q-btn--outline\.text-negative,[\s\S]{0,180}?\}/)
    expect(outline).toBeTruthy()
    expect(outline[0]).toContain('background: var(--lc-danger-soft) !important')

    // `deep-orange` — тот же «опасно»: пятого оттенка красного в приложении нет.
    expect(css).toContain('.q-btn--outline.text-deep-orange:before')
    expect(css).toContain('border-color: var(--lc-danger-line)')
  })

  it('кнопки — «пилюли», как чипы и тумблеры; значок синка остаётся сплошным', () => {
    // Форма: кнопка = чип = сегмент тумблера (круглые иконочные и стрелки шагомера
    // задают свой радиус ниже по файлу).
    expect(css).toContain('.q-btn:not(.q-btn--round)')

    // Исключение из «чипов»: индикатор синка в шапке — знак состояния, а не кнопка,
    // ему нужна сплошная заливка (правка владельца 15.09.2026, «только значок»).
    expect(css).toMatch(/\.q-btn\.bg-secondary:not\(\.lc-sync-chip--icon\)/)
    expect(css).toContain('.q-btn.lc-sync-chip.lc-sync-chip--synced')
  })

  it('подписи кнопок строчными: Quasar больше не пишет их капсом', () => {
    const base = css.match(/\.q-btn\s*\{[^}]*\}/)
    expect(base).toBeTruthy()
    expect(base[0]).toContain('text-transform: none')
  })

  it('фокус в полях подсвечивается акцентом, как и остальной интерактив', () => {
    expect(css).toContain('.q-field--outlined.q-field--highlighted .q-field__control:after')
    expect(css).toContain('border-color: var(--lc-accent)')
    expect(css).toContain('.q-field--filled.q-field--highlighted .q-field__control:after')
  })
})

describe('сегментированные тумблеры вне карточки заказа — тот же «чип»-язык', () => {
  it('`.lc-seg` — «таблетка» с мягкой заливкой активного сегмента', () => {
    const track = css.match(/\.lc-seg\s*\{[^}]*\}/)
    expect(track).toBeTruthy()
    expect(track[0]).toContain('border-radius: 999px')
    expect(track[0]).toContain('background: var(--lc-surface-3)')

    const active = css.match(/\.lc-seg \.q-btn\[aria-pressed='true'\]\s*\{[^}]*\}/)
    expect(active).toBeTruthy()
    expect(active[0]).toContain('background: var(--lc-accent-soft) !important')
    expect(active[0]).toContain('color: var(--lc-accent) !important')
    expect(active[0]).toContain('box-shadow: inset 0 0 0 1px var(--lc-accent-border)')
  })

  it('склад и «Аналитика» используют класс, а не палитровые пропсы', () => {
    const store = read('src/components/store/StoreHistoryPanel.vue')
    const analytic = read('src/pages/AnalyticPage.vue')

    expect(store).toContain('class="lc-seg full-width q-mb-sm"')
    expect(analytic).toContain('class="lc-seg"')

    // Цвета тумблера задаёт `.lc-seg`: палитровых пропсов в его разметке больше нет
    // (в «Аналитике» `grey-9` остаётся у трека графика — это не тумблер).
    for (const [file, source] of [
      ['StoreHistoryPanel.vue', store],
      ['AnalyticPage.vue', analytic],
    ]) {
      const toggle = source.match(/<q-btn-toggle[\s\S]*?\/>/)
      expect(toggle, `нет q-btn-toggle в ${file}`).toBeTruthy()
      expect(toggle[0], file).toContain('lc-seg')

      for (const prop of ['toggle-color=', 'toggle-text-color=', 'text-color=', 'grey-9']) {
        expect(toggle[0], `${file}: ${prop}`).not.toContain(prop)
      }
    }
  })
})

describe('список заказов: заказ — отдельная карточка', () => {
  it('страница рисует список классом `.lc-order-list`, а не общей карточкой', () => {
    const page = read('src/pages/OrdersPage.vue')

    expect(page).toContain('class="lc-order-list q-py-xs"')
    // Пустое состояние остаётся карточкой, но список в неё больше не завёрнут.
    expect(page).toContain('v-if="!filteredOrders.length" class="lc-card"')
  })

  it('строка заказа получает рамку, радиус и отступ от соседей', () => {
    const list = css.match(/\.lc-order-list\s*\{[^}]*\}/)
    expect(list).toBeTruthy()
    expect(list[0]).toContain('gap: 10px')

    const row = css.match(/\.lc-order-row\s*\{[^}]*\}/)
    expect(row).toBeTruthy()
    expect(row[0]).toContain('background: var(--lc-surface)')
    expect(row[0]).toContain('border: 1px solid var(--lc-border)')
    expect(row[0]).toContain('border-radius: var(--lc-radius)')
    expect(row[0]).toContain('overflow: hidden')

    // Поля строки больше не приходят из `.lc-card .q-item` — правило живёт в списке.
    expect(css).toContain('.lc-order-list .q-item')
  })

  it('полоса статуса — «пилюля» слева, срезанная радиусом карточки', () => {
    const strip = css.match(/\.lc-order-row::before\s*\{[^}]*\}/)
    expect(strip).toBeTruthy()
    expect(strip[0]).toContain('border-radius: 0 999px 999px 0')
    expect(strip[0]).toContain('background: var(--lc-row-color, var(--lc-border))')
  })
})
