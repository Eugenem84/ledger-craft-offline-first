// test/swipe-navigation.test.js
//
// Правка владельца 17.09.2026: «сделать, чтобы переключение "заказ", "склад", "каталог"
// осуществлялось свайпом» + «у приложения будет фоновая картинка, у каждой специализации
// своя, и при свайпе она двигается».
//
// Логика свайпа и выбора картинки — «чистая» (`utils/tabSwipe.js`,
// `domain/backgrounds.js`), её проверяем как функции. Каркас (`MainLayout.vue`), слой
// фона (`LcAppBackground.vue`), плавающая кнопка (`LcFab.vue`) и стили (`app.scss`) —
// структурно по исходникам: в проекте нет @vue/test-utils (см. `test/order-tabs.test.js`).
//
// Почему структурные проверки здесь уместны: почти все грабли свайпа — это контракт
// библиотек и браузера, который тестом логики не поймать:
//   • `v-touch-swipe` требует собственного учёта «один свайп = один переход» (директива
//     зовёт обработчик на каждом движении пальца) и клипа по горизонтали у контейнера;
//   • `transform` на странице со слайдом становится содержащим блоком для
//     `position: fixed`, поэтому плавающую кнопку уносит в `body` (Teleport);
//   • «стеклянные» поверхности включаются только при наличии картинки — иначе внешний
//     вид приложения изменился бы до того, как владелец приложит файлы.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_FALLBACK_SCALE,
  BACKGROUND_SHIFT_MAX,
  BACKGROUND_SHIFT_MIN,
  BACKGROUND_SLACK_USAGE,
  SWIPE_EDGE_GUARD,
  SWIPE_MAX_DRIFT_Y,
  backgroundLayout,
  backgroundOffset,
  isEdgeGesture,
  resolveSwipe,
  resolveSwipeTarget,
  swipeStep,
  swipeTransitionName,
  tabIndexByPath,
} from 'src/utils/tabSwipe.js'
import { DEFAULT_BACKGROUND_KEY, resolveBackgroundKey } from 'src/domain/backgrounds.js'
import {
  backgroundUrl,
  hasBackgrounds,
  resolveBackgroundUrl,
} from 'src/services/backgroundAssets.js'
import { PRESET_KEYS } from 'src/domain/presets/index.js'
import routes from 'src/router/routes.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(path.join(root, relative), 'utf8')

/** Пустые (void) элементы HTML: закрывающего тега у них нет. */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/**
 * Верхнеуровневые элементы шаблона SFC.
 *
 * Нужен, чтобы поймать фрагмент-корень: `<Transition>` умеет ровно одного ребёнка с
 * одним корневым элементом, а страница с диалогами «рядом» с `q-page` — это фрагмент.
 * Парсер нарочно простой (без DOM): сканируем теги, считаем вложенность, учитываем
 * комментарии и кавычки в атрибутах.
 *
 * @param {string} source содержимое `.vue`
 * @returns {string[]} имена тегов верхнего уровня
 */
function templateRoots(source) {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  const html = source.slice(start + '<template>'.length, end).replace(/<!--[\s\S]*?-->/g, '')
  const roots = []
  let depth = 0
  let i = 0

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) break

    // Конец тега ищем с учётом кавычек: `:hint="a > b"` внутри атрибута не должен
    // обрывать разбор.
    let j = lt + 1
    let quote = ''

    while (j < html.length) {
      const char = html[j]

      if (quote !== '') {
        if (char === quote) quote = ''
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === '>') {
        break
      }

      j += 1
    }

    const tag = html.slice(lt + 1, j)
    const closing = tag.startsWith('/')
    const name = (closing ? tag.slice(1) : tag).match(/^[A-Za-z][\w.-]*/)?.[0] ?? ''
    const selfClosing = tag.endsWith('/') || VOID_TAGS.has(name.toLowerCase())

    if (closing) {
      depth = Math.max(0, depth - 1)
    } else {
      if (depth === 0 && name !== '') roots.push(name)
      if (!selfClosing) depth += 1
    }

    i = j + 1
  }

  return roots
}

/** Вкладки в том порядке, в каком их рисует таббар (см. `MainLayout.tabs`). */
const TABS = [
  { name: 'orders', to: '/orders' },
  { name: 'store', to: '/store' },
  { name: 'catalog', to: '/catalog' },
  { name: 'analytic', to: '/analytic' },
  { name: 'other', to: '/other' },
]

/** Страницы, которые рендерятся внутри `MainLayout` (по реальному `routes.js`). */
function collectLayoutPages(list, found = []) {
  for (const route of list || []) {
    const component = typeof route.component === 'function' ? String(route.component) : ''

    if (component.includes('layouts/MainLayout.vue')) {
      for (const child of route.children || []) {
        found.push(
          String(child.component)
            .replace(/^.*pages\//, 'src/pages/')
            .replace(/['")].*$/, ''),
        )
      }
    }

    if (route.children) collectLayoutPages(route.children, found)
  }

  return found
}

describe('свайп: порядок вкладок и направление', () => {
  it('индекс вкладки берётся из таббара, а не из routes.js', () => {
    // «каталог» объявлен в `routes.js` последним, но в таббаре идёт третьим: если считать
    // порядок по маршрутам, свайп прыгал бы через раздел.
    expect(tabIndexByPath(TABS, '/orders')).toBe(0)
    expect(tabIndexByPath(TABS, '/catalog')).toBe(2)
    expect(tabIndexByPath(TABS, '/order-report')).toBe(-1)
    expect(tabIndexByPath(TABS, '/orders/12')).toBe(-1)
  })

  it('палец влево — вкладка правее, палец вправо — левее', () => {
    expect(swipeStep('left')).toBe('next')
    expect(swipeStep('right')).toBe('prev')
    expect(swipeStep('up')).toBeNull()
  })

  it('свайп переводит только на соседнюю вкладку', () => {
    expect(resolveSwipeTarget(TABS, '/orders', 'left')).toBe('/store')
    expect(resolveSwipeTarget(TABS, '/store', 'right')).toBe('/orders')
    expect(resolveSwipeTarget(TABS, '/catalog', 'left')).toBe('/analytic')
  })

  it('на краях списка свайп ничего не делает (без «заворачивания»)', () => {
    expect(resolveSwipeTarget(TABS, '/orders', 'right')).toBeNull()
    expect(resolveSwipeTarget(TABS, '/other', 'left')).toBeNull()
  })

  it('вне вкладок (карточка заказа) и на одной вкладке свайпа нет', () => {
    expect(resolveSwipeTarget(TABS, '/orders/12', 'left')).toBeNull()
    expect(resolveSwipeTarget([{ to: '/orders' }], '/orders', 'left')).toBeNull()
    expect(resolveSwipeTarget(null, '/orders', 'left')).toBeNull()
  })

  it('один свайп — один переход: «разряжённый» жест игнорируется', () => {
    const info = { direction: 'left', distance: { x: 120, y: 4 } }

    expect(resolveSwipe(info, TABS, '/orders', true)).toBe('/store')
    // Директива зовёт обработчик на каждом движении пальца — без этого флага один жест
    // увёл бы на несколько разделов.
    expect(resolveSwipe(info, TABS, '/orders', false)).toBeNull()
  })

  it('диагональная прокрутка не считается листанием', () => {
    // У `v-touch-swipe` порог по вертикали — 100px: на длинном списке это диагональный
    // скролл, который менял бы раздел. Своя проверка строже (`SWIPE_MAX_DRIFT_Y`).
    const scroll = { direction: 'left', distance: { x: 90, y: SWIPE_MAX_DRIFT_Y + 1 } }

    expect(resolveSwipe(scroll, TABS, '/orders', true)).toBeNull()
    expect(
      resolveSwipe({ direction: 'left', distance: { x: 90, y: 10 } }, TABS, '/orders', true),
    ).toBe('/store')
  })

  it('анимация перехода смотрит на разницу индексов', () => {
    expect(swipeTransitionName(0, 1)).toBe('lc-swipe-next')
    expect(swipeTransitionName(2, 1)).toBe('lc-swipe-prev')
    // Тап по таббару через два раздела — та же сторона, что у свайпа (знак разницы).
    expect(swipeTransitionName(0, 3)).toBe('lc-swipe-next')
    expect(swipeTransitionName(1, 1)).toBe('')
    expect(swipeTransitionName(-1, 2)).toBe('')
  })
})

describe('свайп: край экрана отдан системе', () => {
  it('жест в «системной» зоне не наш (Android 15: назад от левого края)', () => {
    expect(isEdgeGesture(4, 400)).toBe(true)
    expect(isEdgeGesture(SWIPE_EDGE_GUARD, 400)).toBe(true)
    expect(isEdgeGesture(400 - SWIPE_EDGE_GUARD, 400)).toBe(true)
    expect(isEdgeGesture(200, 400)).toBe(false)
  })

  it('без координаты начала жест не рискует', () => {
    expect(isEdgeGesture(Number.NaN, 400)).toBe(true)
    expect(isEdgeGesture(200, Number.NaN)).toBe(true)
  })
})

describe('фон: параллакс по вкладкам', () => {
  it('смещение от -1 (первая вкладка) до +1 (последняя)', () => {
    expect(backgroundOffset(0, 5)).toBe(-1)
    expect(backgroundOffset(2, 5)).toBe(0)
    expect(backgroundOffset(4, 5)).toBe(1)
    expect(backgroundOffset(1, 3)).toBe(0)
  })

  it('одна вкладка (или неизвестный индекс) — фон стоит', () => {
    expect(backgroundOffset(0, 1)).toBe(0)
    expect(backgroundOffset(-1, 5)).toBe(0)
    expect(backgroundOffset(9, 5)).toBe(0)
  })
})

describe('фон: раскладка под реальные пропорции картинки', () => {
  /** Обычный портретный телефон (360×800 CSS px). */
  const viewport = { viewportWidth: 360, viewportHeight: 800 }
  const at = (offset, image = { imageWidth: 1024, imageHeight: 1024 }) =>
    backgroundLayout({ ...viewport, ...image, offset })

  it('квадрат: запас свой, увеличения нет, амплитуда на пределе', () => {
    // `cover` тянет квадрат по высоте (800px при экране 360px) — лишняя ширина и есть запас
    // под параллакс, увеличивать картинку не нужно (иначе теряем резкость и композицию).
    expect(at(-1).scale).toBe(1)
    expect(at(1).scale).toBe(1)
    // Знак: на первой вкладке картинка сдвинута вправо, окно обзора — у её левого края.
    expect(at(-1).shift).toBe(BACKGROUND_SHIFT_MAX)
    expect(at(1).shift).toBe(-BACKGROUND_SHIFT_MAX)
    // Сдвиг 16% экрана (58px) намного меньше запаса (220px) — край не оголится.
    const slack = (800 - 360) / 2
    expect((BACKGROUND_SHIFT_MAX / 100) * 360).toBeLessThan(slack)
  })

  it('кадр ровно 9:20: запаса нет — картинка чуть увеличивается', () => {
    const ratio = { imageWidth: 1440, imageHeight: 3200 }
    const left = at(-1, ratio)
    const right = at(1, ratio)

    // coverWidth = 360 (экран), нужно 360 + 2×8% → scale ≈ 1.16.
    expect(left.scale).toBeCloseTo(1.16, 2)
    expect(left.shift).toBe(BACKGROUND_SHIFT_MIN)
    expect(right.shift).toBe(-BACKGROUND_SHIFT_MIN)
  })

  it('промежуточный случай: амплитуда = доля запаса, а не предел', () => {
    // Кадр чуть шире экранного 9:20: запаса хватает на 10% ширины экрана.
    const layout = at(1, { imageWidth: 600, imageHeight: 1000 })
    const coverWidth = 800 * 0.6

    expect(((coverWidth - 360) / 2 / 360) * 100 * BACKGROUND_SLACK_USAGE).toBeCloseTo(10, 5)
    expect(layout.shift).toBe(-10)
    expect(layout.scale).toBe(1)
  })

  it('середина списка и мусорные данные не ломают раскладку', () => {
    expect(at(0).shift).toBe(0)

    const unknown = backgroundLayout({ ...viewport, offset: 1 })
    expect(unknown.scale).toBe(BACKGROUND_FALLBACK_SCALE)
    expect(unknown.shift).toBe(-BACKGROUND_SHIFT_MIN)

    const broken = backgroundLayout({ viewportWidth: 0, viewportHeight: 0, offset: -1 })
    expect(broken.scale).toBe(BACKGROUND_FALLBACK_SCALE)
    expect(broken.shift).toBe(BACKGROUND_SHIFT_MIN)

    const nanOffset = at(Number.NaN)
    expect(Number.isFinite(nanOffset.scale)).toBe(true)
    expect(nanOffset.shift).toBe(0)
  })

  it('очень широкий кадр (панорама): амплитуда всё равно ограничена', () => {
    const wide = at(-1, { imageWidth: 6000, imageHeight: 1000 })

    expect(wide.scale).toBe(1)
    expect(wide.shift).toBe(BACKGROUND_SHIFT_MAX)
  })
})

describe('фон: картинка специализации', () => {
  it('ключ картинки — `preset_key` профиля, иначе запасная', () => {
    expect(resolveBackgroundKey({ preset_key: 'auto' })).toBe('auto')
    expect(resolveBackgroundKey({ preset_key: ' Bike ' })).toBe('bike')
    expect(DEFAULT_BACKGROUND_KEY).toBe('default')
    expect(resolveBackgroundKey({ preset_key: '' })).toBe('default')
    expect(resolveBackgroundKey({ preset_key: null })).toBe('default')
    expect(resolveBackgroundKey(null)).toBe('default')
  })

  it('неизвестный ключ — не ошибка: картинки просто нет', () => {
    // Профиль мог приехать синком из сборки с другой нишей.
    expect(resolveBackgroundKey({ preset_key: 'space' })).toBe('space')
    expect(resolveBackgroundUrl({ preset_key: 'space' })).toBeNull()
  })

  it('файл картинки подхватывается сборкой, а пропуски — не ошибка', () => {
    // `src/assets/backgrounds/bike.webp` — картинка владельца (17.09.2026). Сборщик отдаёт
    // её URL профилю `bike`; для остальных ниш файлов пока нет, и это нормально: фон просто
    // остаётся чёрным, а `.lc-has-bg` — сплошным (иначе пропуск выглядел бы дефектом).
    expect(hasBackgrounds()).toBe(true)
    expect(resolveBackgroundUrl({ preset_key: 'bike' })).toContain('bike')
    expect(resolveBackgroundUrl({ preset_key: ' BIKE ' })).toContain('bike')
    expect(resolveBackgroundUrl({ preset_key: 'auto' })).toBeNull()
    expect(resolveBackgroundUrl(null)).toBeNull()
    expect(backgroundUrl('')).toBeNull()
  })
})

describe('фон: ТЗ картинок совпадает с именами файлов', () => {
  it('для каждой специализации в README рядом с папкой описан свой файл', () => {
    const readme = read('src/assets/backgrounds/README.md')

    expect(PRESET_KEYS.length).toBeGreaterThan(2)

    for (const key of PRESET_KEYS) {
      expect(readme, `${key}: в README нет файла картинки`).toContain(`${key}.webp`)
    }
  })

  it('в ТЗ есть размер, вес, формат и требования к яркости', () => {
    const readme = read('src/assets/backgrounds/README.md')

    expect(readme).toContain('1440 × 3200')
    expect(readme).toContain('300 КБ')
    expect(readme).toContain('sRGB')
    expect(readme).toContain('WebP')
  })
})

describe('каркас: свайп подключён и учтён контракт Quasar', () => {
  const layout = read('src/layouts/MainLayout.vue')
  const css = read('src/css/app.scss')
  const fab = read('src/components/ui/LcFab.vue')
  const background = read('src/components/ui/LcAppBackground.vue')
  const assets = read('src/services/backgroundAssets.js')

  it('жест висит на контейнере страниц и строже дефолта Quasar', () => {
    expect(layout).toContain('v-touch-swipe:0.25:24.horizontal="onSwipe"')
    // Свой учёт касания: «один свайп = один переход» + координата начала жеста.
    expect(layout).toContain('@touchstart.passive="onSwipeStart"')
    expect(layout).toContain('@touchend="onSwipeEnd"')
    expect(layout).toContain('class="lc-viewport"')
    expect(css).toContain('.lc-viewport {')
    expect(css).toContain('overflow-x: clip')
  })

  it('решения принимает чистая логика, а не разметка', () => {
    expect(layout).toContain('resolveSwipe(info, tabs.value, route.path, swipeArmed.value)')
    expect(layout).toContain('isEdgeGesture(swipeStartX.value, window.innerWidth)')
    expect(layout).toContain('swipeTransitionName(previousTabIndex.value, next)')
  })

  it('свайп не срабатывает поверх открытого окна', () => {
    // `q-dialog` рендерится внутри страницы: без проверки жест увёл бы раздел под открытым
    // диалогом, а Quasar закрывает диалог при смене маршрута — форма потерялась бы.
    expect(layout).toContain("target.closest('.q-dialog, .q-menu')")
  })

  it('переход — `mode="out-in"` по обёртке, а не по странице', () => {
    expect(layout).toContain('<Transition :name="transitionName" mode="out-in">')
    expect(layout).toContain('<router-view v-slot="{ Component, route: currentRoute }">')
    // Обёртка с ключом: без неё переход зависел бы от того, сколько корней у страницы
    // (без ключа Vue переиспользует тот же `div` и анимации не будет вовсе).
    expect(layout).toContain('<div :key="currentRoute.path" class="lc-view">')
    expect(css).toContain('.lc-swipe-next-enter-from')
    expect(css).toContain('.lc-swipe-prev-enter-from')
    expect(css).toContain('.lc-swipe-next-leave-active')
  })

  it('плавающая кнопка живёт в body — иначе слайд ломает position: fixed', () => {
    expect(fab).toContain('<Teleport to="body">')
    expect(css).toContain('animation: lc-fab-in')
  })

  it('фон — слой под контентом, который не перехватывает касания', () => {
    expect(layout).toContain(
      '<LcAppBackground :url="appBackgroundUrl" :offset="backgroundPosition" />',
    )
    expect(background).toContain('z-index: -1')
    expect(background).toContain('pointer-events: none')
    expect(background).toContain('object-fit: cover')
    // Движения фона: параллакс при листании и кроссфейд при смене профиля.
    expect(background).toContain('translate3d(')
    expect(background).toContain('lc-appbg-fade-enter-active')
  })

  it('амплитуда параллакса считается от пропорций картинки, а не задана жёстко', () => {
    // Квадрат (как у владельца) отдаёт свой запас, кадр ровно 9:20 увеличивается. Жёсткие
    // «scale(1.25) и ±8%» либо прятали запас квадрата, либо мылили картинку.
    expect(background).toContain('backgroundLayout({')
    expect(background).toContain('@load="onImageLoad"')
    expect(background).toContain('viewportWidth: $q.screen.width')
    expect(background).toContain('imageWidth: natural.value?.width')
  })

  it('«стеклянные» поверхности включаются только вместе с картинкой', () => {
    expect(layout).toContain(':class="{ \'lc-has-bg\': hasBackground }"')
    expect(css).toContain('.lc-has-bg {')
    expect(css).toContain('--lc-surface: rgba(18, 18, 18, 0.86)')
    expect(css).toContain('--lc-chrome: rgba(0, 0, 0, 0.72)')
    // Страница перестаёт закрашивать фон, иначе картинку не видно.
    expect(css).toMatch(/\.lc-has-bg\s*\{[^}]*--lc-bg: transparent/)
    // Шапка берёт токен, а не непрозрачный класс Quasar (`bg-black` — `!important`).
    expect(layout).not.toContain('lc-appbar bg-black')
    expect(layout).toContain('background: var(--lc-chrome)')
  })

  it('картинки подхватываются сборкой по имени файла', () => {
    expect(assets).toContain("import.meta.glob('../assets/backgrounds/*.{webp,avif,png,jpg,jpeg}'")
    expect(assets).toContain('eager: true')
    // Не через `public/`: отсутствующий файл давал бы 404 и пустой фон на первом кадре.
    expect(assets).not.toContain('public/backgrounds')
  })
})

describe('каркас: у страницы раздела один корневой элемент', () => {
  // `<Transition>` (в каркасе — переход между разделами) умеет ровно одного ребёнка с
  // ОДНИМ корневым элементом. У фрагмент-корня своего элемента нет: при уходе со страницы
  // Vue вешает leave-классы на якорный текстовый узел фрагмента, у которого нет
  // `classList`, — исключение убивает приложение.
  //
  // Живой прогон 17.09.2026 (сразу после выката бандла 1.14.2.260917-1458): «на телефоне
  // свайпы работают нормально только "заказ" и "склад", а когда перелистываю на каталог,
  // то обратно уже чёрный экран и всё ни туда ни сюда». Причина — `CatalogPage.vue`:
  // восемь корней (`q-page` + три `LcDialogShell` + четыре диалога рядом). Тест ловит это
  // до живого прогона: он идёт по `routes.js` и требует у каждой страницы каркаса ровно
  // один корень.
  const pages = collectLayoutPages(routes)

  it('страницы каркаса найдены (защита от «пустого» теста)', () => {
    expect(pages.length).toBeGreaterThan(2)
  })

  it.each(pages)('%s: один корневой элемент (`q-page`)', (file) => {
    const roots = templateRoots(read(file))

    expect(
      roots,
      `${file}: корневых элементов — ${roots.length} (${roots.join(', ')}). Каркас анимирует ` +
        'раздел через `<Transition>`, а он умеет ровно один корневой элемент: диалоги и ' +
        'прочие блоки должны лежать ВНУТРИ `<q-page>` — иначе Vue уронит приложение при ' +
        'уходе со страницы (у фрагмент-корня нет своего элемента).',
    ).toEqual(['q-page'])
  })

  it('парсер шаблонов различает один корень и фрагмент (защита от «пустого» теста)', () => {
    // Иначе сломанный парсер говорил бы «всё хорошо» на любой странице.
    expect(templateRoots('<template>\n  <q-page>\n  </q-page>\n</template>')).toEqual(['q-page'])

    expect(
      templateRoots('<template>\n  <q-page>\n  </q-page>\n  <LcDialogShell />\n</template>'),
    ).toEqual(['q-page', 'LcDialogShell'])

    // Кавычки с `>` внутри атрибута и комментарии разбор не ломают.
    expect(
      templateRoots(
        '<template>\n  <!-- <foo /> -->\n  <q-page :hint="a > b">\n  </q-page>\n</template>',
      ),
    ).toEqual(['q-page'])

    // Void-элемент внутри не считается корнем и не портит вложенность.
    expect(templateRoots('<template>\n  <q-page>\n    <br>\n  </q-page>\n</template>')).toEqual([
      'q-page',
    ])
  })
})
