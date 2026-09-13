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
