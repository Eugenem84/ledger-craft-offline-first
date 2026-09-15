// test/pages-layout.test.js
//
// Структурная проверка: `QPage` не остаётся без `QLayout`. Дефект, найденный на живом
// прогоне (задача 11.5): `/login` и `/register` — маршруты **верхнего уровня** (вне
// `MainLayout`), а их страницы начинались с `<q-page>`. Quasar падал с
// «QPage needs to be a deep child of QLayout», страница не монтировалась, а индикатор
// «требуется вход» вёл на уже открытый (но пустой) `/login` — выглядело как «кнопка
// не реагирует».
//
// Тест идёт по реальному `src/router/routes.js`, поэтому поймает и будущие маршруты
// вне layout'а, а не только текущие два.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import routes from 'src/router/routes.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LAYOUT_MARKER = 'layouts/MainLayout.vue'

/** Собирает страницы, которые рендерятся вне `MainLayout` (прямо в корне приложения). */
function collectOutsideLayout(list, insideLayout = false, found = []) {
  for (const route of list || []) {
    const component = typeof route.component === 'function' ? String(route.component) : ''
    const rendersLayout = component.includes(LAYOUT_MARKER)
    const nestedInside = insideLayout || rendersLayout

    if (!nestedInside && component.includes('pages/')) {
      found.push(component)
    }

    if (route.children) collectOutsideLayout(route.children, nestedInside, found)
  }

  return found
}

/** `() => import('pages/LoginPage.vue')` → `LoginPage.vue`. */
function toFileName(component) {
  const match = component.match(/pages\/([\w-]+\.vue)/)
  return match ? match[1] : component
}

const outsidePages = [...new Set(collectOutsideLayout(routes))].map(toFileName)

describe('каркас страниц: QPage только внутри QLayout', () => {
  it('страницы вне MainLayout найдены (защита от «пустого» теста)', () => {
    expect(outsidePages.length).toBeGreaterThan(2)
  })

  it.each(outsidePages)('%s: есть QLayout, если используется QPage', pageFile => {
    const source = readFileSync(path.join(root, 'src/pages', pageFile), 'utf8')

    if (!source.includes('<q-page')) return

    expect(
      source.includes('<q-layout'),
      `${pageFile}: маршрут рендерится вне MainLayout, и страница использует <q-page> без ` +
        '<q-layout>. Quasar бросает «QPage needs to be a deep child of QLayout» и страница ' +
        'не монтируется — оберните шаблон в QLayout + QPageContainer.'
    ).toBe(true)
  })
})

// Задача 14.11 (жалоба мастера через «Сообщить об ошибке», живой прогон 13.09.2026):
// «при просмотре ордера кнопка синхронизации перекрывает список ордеров».
// Причина: карточка заказа — маршрут вне `MainLayout`, и `App.vue` монтировал чип в
// плавающем варианте (`position: fixed; bottom: 72px`), хотя таббара там нет.
// Проверяем структурно: чип живёт только в шапке каркаса, плавающего режима нет.
describe('14.11 чип синка — только в шапке каркаса', () => {
  it('App.vue больше не рендерит SyncStatusBar и не считает «вне каркаса»', () => {
    const app = readFileSync(path.join(root, 'src/App.vue'), 'utf8')

    expect(app).not.toContain('SyncStatusBar')
    expect(app).not.toContain('inMainLayout')
  })

  it('в компоненте не осталось плавающего режима (floating / position: fixed)', () => {
    const bar = readFileSync(path.join(root, 'src/components/SyncStatusBar.vue'), 'utf8')

    expect(bar).not.toContain('floating')
    expect(bar).not.toContain('position: fixed')
  })

  it('шапка каркаса индикатор по-прежнему показывает', () => {
    const layout = readFileSync(path.join(root, 'src/layouts/MainLayout.vue'), 'utf8')

    expect(layout).toContain('SyncStatusBar')
  })

  // Правка владельца 15.09.2026: «индикатор бесит» → чип без подписи, только значок;
  // рядом — очень мелкая серая версия приложения (`useUpdateStore`).
  it('чип синка — только значок (подписи нет), а версия приложения — рядом', () => {
    const bar = readFileSync(path.join(root, 'src/components/SyncStatusBar.vue'), 'utf8')
    const layout = readFileSync(path.join(root, 'src/layouts/MainLayout.vue'), 'utf8')

    // Текста у чипа нет; состояние дублируется в тултипе и в `aria-label`.
    expect(bar).not.toContain(':label="view.label"')
    expect(bar).toContain(':aria-label="`синхронизация: ${view.label}`"')
    expect(bar).toContain('lc-sync-chip--icon')

    // Версия — из стора обновлений, отдельным мелким классом рядом с чипом.
    expect(layout).toContain('currentVersionShort')
    expect(layout).toContain('lc-app-version')
    expect(layout).toContain('v-if="appVersion"')

    // Состояние несёт и модификатор по `kind`: у «синхронизировано» свой, насыщенный
    // зелёный (жалоба владельца 15.09.2026: палитровый `positive` был «салатовым»).
    const css = readFileSync(path.join(root, 'src/css/app.scss'), 'utf8')

    expect(bar).toContain('lc-sync-chip--${view.kind}')
    expect(css).toContain('.lc-sync-chip--synced')
    expect(css).toContain('background: var(--lc-sync-ok) !important')
    expect(css).toContain('--lc-sync-ok: #2e7d32')
  })
})

