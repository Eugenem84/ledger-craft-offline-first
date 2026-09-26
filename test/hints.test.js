// test/hints.test.js
//
// Подсказки интерфейса (правка владельца 26.09.2026: «по приложению есть подсказки.
// Они занимают место. Нужно сделать их мельче в два раза и опционально по умолчанию
// выключать в настройках»).
//
// Проверяем три вещи:
//   1. флаг — настройка устройства, по умолчанию **выключена**, переключается и запоминается;
//   2. единый компонент `LcHint` при выключенном флаге не рендерится, а включённый
//      показывается уменьшенным шрифтом (`.lc-hint`);
//   3. подсказки действительно переведены на компонент, а тумблер в настройках связан с флагом.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

import { HINTS_KEY, hintsEnabled, isHintsEnabled, setHints, toggleHints } from 'src/utils/hints.js'
import storage from 'src/utils/storage.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('26.09.2026 подсказки интерфейса', () => {
  beforeEach(() => {
    storage.removeItem(HINTS_KEY)
    hintsEnabled.value = false
  })

  it('по умолчанию подсказки выключены', () => {
    expect(storage.getItem(HINTS_KEY)).toBe(null)
    expect(isHintsEnabled()).toBe(false)
  })

  it('включение, выключение и переключение запоминаются на устройстве', () => {
    expect(setHints(true)).toBe(true)
    expect(isHintsEnabled()).toBe(true)
    expect(storage.getItem(HINTS_KEY)).toBe('1')

    expect(setHints(false)).toBe(false)
    expect(storage.getItem(HINTS_KEY)).toBe('0')

    expect(toggleHints()).toBe(true)
    expect(isHintsEnabled()).toBe(true)
  })

  it('единственный компонент подсказки: при выключенном флаге не рендерится', () => {
    const component = read('src/components/ui/LcHint.vue')

    // Скрытие — на уровне рендера: выключенная подсказка не занимает место вообще.
    expect(component).toContain("v-if=\"hintsEnabled\"")
    expect(component).toContain('class="lc-hint"')
    expect(component).toContain("from 'src/utils/hints.js'")
  })

  it('включённые подсказки показываются уменьшенным шрифтом', () => {
    const css = read('src/css/app.scss')

    // «Мельче в два раза»: прежняя подсказка была `text-caption` (12px), теперь ~8px.
    expect(css).toMatch(/\.lc-hint\s*\{[^}]*font-size:\s*0\.5rem/)
    expect(css).toMatch(/\.lc-hint\s*\{[^}]*color:\s*var\(--lc-text-mute\)/)
  })

  it('тумблер «показывать подсказки» в настройках связан с флагом', () => {
    const settings = read('src/components/settings/SettingsDialog.vue')

    expect(settings).toContain("from 'src/utils/hints.js'")
    expect(settings).toMatch(/const hints = computed\(\{/)
    expect(settings).toContain('v-model="hints"')
    expect(settings).toContain('показывать подсказки')
    expect(settings).toContain("name: 'interface'")
  })

  it('подсказки переведены на общий компонент `LcHint`', () => {
    const files = [
      'src/components/ui/LcEmptyState.vue',
      'src/components/order/OrderOverviewPanel.vue',
      'src/components/order/OrderServicesPanel.vue',
      'src/components/settings/ReportSettingsPanel.vue',
      'src/components/settings/SettingsDialog.vue',
    ]

    for (const file of files) {
      expect(read(file), file).toContain('LcHint')
    }
  })
})
