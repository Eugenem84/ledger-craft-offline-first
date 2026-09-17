// test/phase12-profile.test.js
//
// Фаза 12, задачи 12.1–12.3. Продуктовая полировка профилей и карточки заказа:
//   • 12.1 — специализацию можно только ВЫБРАТЬ из доступных пресетов (свой профиль
//     «без пресета» создать нельзя), каталог появляется сразу;
//   • 12.2 — у существующего профиля нет UI-пути менять `name`/`preset_key`;
//   • 12.3 — в карточке заказа статус/оплата управляются одним органом (переключатели).
//
// Плюс правки живого прогона (13.09.2026): компактные переключатели статуса/оплаты,
// «оплачено» — тумблер, и отсутствие дублирующей кнопки создания позиции в карточке заказа.
// Правка владельца (15.09.2026): сегменты переключателя оформлены как чипы статуса —
// те же токены заливки/рамки и та же карта иконок (`ORDER_STATUS_ICONS`).
//
// Логика проверяется на настоящем sql.js (`test/helpers/testDb.js`), UI — структурно
// по исходникам `.vue` (в проекте нет @vue/test-utils — см. `test/order-tabs.test.js`).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { getPreset } from 'src/domain/presets/index.js'
import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import { ORDER_STATUSES, ORDER_STATUS_ICONS } from 'src/utils/analytics.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

const countRows = async table => {
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM ${table}`)
  return Number(total)
}

describe('12.1/12.2 Создание профиля только из доступного пресета', () => {
  beforeEach(async () => {
    await setupTestDb()
    setActivePinia(createPinia())
  })

  it('createFromPreset создаёт профиль с пресетом и сразу материализует каталог', async () => {
    const store = useSpecializationsStore()
    const preset = getPreset('bike')

    const id = await store.createFromPreset('bike')
    const created = store.items.find(item => item.id === id)

    // Профиль получил метаданные пресета — «профилей без пресета» не появляется.
    expect(created).toMatchObject({ name: preset.label, preset_key: 'bike' })
    expect(created.features).toBeTruthy()
    expect(created.template_version).toBe(preset.version ?? null)

    // Каталог материализован сразу, а профиль выбран активным.
    expect(store.selectedId).toBe(id)
    expect(await countRows('categories')).toBe(preset.categories.length)
    expect(await countRows('services')).toBeGreaterThan(0)
  })

  it('неизвестный пресет отклоняется, профиль не создаётся', async () => {
    const store = useSpecializationsStore()

    await expect(store.createFromPreset('nope')).rejects.toThrow(/Неизвестный пресет/)
    expect(store.items).toHaveLength(0)
  })

  // Регрессия, найденная 12.1: `applyPreset` зовёт `update` частичным набором
  // полей, а тот перезаписывает все колонки — без слияния с текущей строкой
  // `name` уходил в биндинг как `undefined` и sql.js падал.
  it('частичное обновление профиля не теряет название', async () => {
    const id = await specializationsRepo.save({ name: 'Веломастерская' })

    await specializationsRepo.update({ id, archived: 1 })
    await specializationsRepo.update({ id, preset_key: 'bike' })

    const row = await db.queryOne('SELECT * FROM specializations WHERE id = ?', [id])
    expect(row).toMatchObject({ name: 'Веломастерская', archived: 1, preset_key: 'bike' })
  })
})

describe('12.1/12.2 UI настроек: выбор профиля, без переименования и смены пресета', () => {
  // Настройки — модальное окно (`components/settings/SettingsDialog.vue`), вкладка
  // «специализация»: раздела «ещё» больше нет (правка владельца 17.09.2026).
  const page = read('src/components/settings/SettingsDialog.vue')

  it('нет свободного ввода названия и переименования', () => {
    expect(page).not.toMatch(/newProfileName|renameProfile|profileName/)
    expect(page).not.toContain('Сохранить название')
    expect(page).not.toContain('Название новой специализации')
  })

  it('добавление — выбор из доступных пресетов, кнопка «Добавить ещё одну специализацию»', () => {
    expect(page).toContain('newProfilePreset')
    expect(page).toContain(':options="presetOptions"')
    expect(page).toContain('Добавить ещё одну специализацию')
    expect(page).toContain('createFromPreset')
  })

  it('нет блока «шаблон специализации» — пресет не применяется к готовому профилю', () => {
    expect(page).not.toContain('шаблон специализации')
    expect(page).not.toContain('Применить шаблон')
    expect(page).not.toContain('@click="applyPreset"')
  })
})

describe('12.3 Карточка заказа: статус и оплата — одним органом управления', () => {
  const header = read('src/components/order/OrderHeaderActions.vue')

  it('в шапке нет дублирующих чипов статуса/оплаты', () => {
    expect(header).not.toContain('<LcStatusChip')
    expect(header).not.toContain('lc-status--paid')
  })

  it('статус и оплата — два переключателя одного вида, без отдельной кнопки', () => {
    // Правка живого прогона: «оплачено» стало таким же `q-btn-toggle` (одна опция +
    // `clearable`), поэтому в шапке ровно два тумблера и нет кнопки с `@click`.
    expect(header.match(/<q-btn-toggle\s/g)).toHaveLength(2)
    expect(header).toContain('@update:model-value="value => emit(\'update:status\', value)"')
    expect(header).toContain('@update:model-value="value => emit(\'update:paid\', value === true)"')
    expect(header).not.toContain("@click=\"emit('update:paid'")
  })

  it('переключатели компактные и оформлены одним классом', () => {
    // «Компактнее»: сегменты ниже за счёт `dense` + уменьшенного кегля в стилях.
    expect(header.match(/class="col lc-toggle"/g)).toHaveLength(1)
    expect(header.match(/class="lc-toggle"/g)).toHaveLength(1)
    expect(header).toContain('min-height: 28px')
    expect(header).toContain('font-size: 12px')
  })

  it('активный сегмент «переезжает» и оформлен как чип статуса (правка владельца 15.09.2026)', () => {
    // Светофорная логика: индикатор берёт мягкую заливку, рамку и цвет подписи из
    // тех же токенов, что чип статуса (`.lc-status--*`) — «статус» и «тумблер статуса»
    // должны читаться как один элемент.
    expect(header).toContain('--lc-toggle-soft: var(--lc-waiting-soft)')
    expect(header).toContain('--lc-toggle-soft: var(--lc-process-soft)')
    expect(header).toContain('--lc-toggle-soft: var(--lc-done-soft)')
    expect(header).toContain('--lc-toggle-line: var(--lc-waiting-line)')
    expect(header).toContain('--lc-toggle-ink: var(--lc-waiting)')
    expect(header).not.toContain('--lc-toggle-color')

    // Индикатор — псевдоэлемент группы: лежит ПОД подписями (сегменты прозрачные)
    // и смещается через `transform` с переходом, а не вспыхивает мгновенно.
    // Рамку рисует inset-тень: у псевдоэлемента нет собственных границ.
    expect(header).toContain('.lc-toggle::before')
    expect(header).toContain('transform: translateX(calc(var(--lc-toggle-shift, 0) * (100% + 4px)))')
    expect(header).toContain('transform 0.28s cubic-bezier')
    expect(header).toContain('box-shadow: inset 0 0 0 1px var(--lc-toggle-line, transparent)')

    // Сегмент должен быть прозрачным: Quasar красит его палитрой с `!important`.
    expect(header).toContain('background: transparent !important')
    expect(header).not.toContain('toggle-color="secondary"')
    expect(header).not.toContain('toggle-color="positive"')

    // Единственный сегмент «оплачено» без значения прячет индикатор (появление плавное).
    expect(header).toContain('.lc-toggle--paid:not(.lc-toggle--on)::before')

    // Класс статуса считает скрипт: незнакомый статус не даёт `lc-toggle--undefined`.
    expect(header).toContain(':class="statusModifier"')
    expect(header).toContain("lc-toggle--${known ? props.status : 'unknown'}")

    // Иконки сегментов — из общей карты `ORDER_STATUS_ICONS` и того же кегля, что у чипа.
    expect(header).toContain('ORDER_STATUS_ICONS')
    expect(header).toContain('icon: ORDER_STATUS_ICONS[item.value]')
    expect(header).toContain('font-size: 14px')

    // Ряд из четырёх сегментов должен влезать в карточку: отступ сегмента ужат, а на
    // экранах уже 360px иконки скрываются (иначе на 320px ряд обрезался бы).
    expect(header).toContain('padding: 2px 5px')
    expect(header).toContain('@media (max-width: 359px)')
  })

  it('чип статуса и переключатель берут цвета и иконки из одного источника', () => {
    // Токены мягкой заливки/рамки объявлены один раз (app.scss) и используются и
    // чипом, и индикатором тумблера — иначе оформление снова разъедется.
    const css = read('src/css/app.scss')
    const chip = read('src/components/ui/LcStatusChip.vue')

    expect(css).toContain('--lc-waiting-soft: rgba(255, 179, 0, 0.12)')
    expect(css).toContain('--lc-waiting-line: rgba(255, 179, 0, 0.35)')
    expect(css).toContain('--lc-process-soft: rgba(229, 57, 53, 0.12)')
    expect(css).toContain('--lc-done-soft: rgba(67, 160, 71, 0.12)')
    expect(css).toContain('--lc-paid-soft: rgba(67, 160, 71, 0.12)')

    expect(css).toContain('background: var(--lc-waiting-soft)')
    expect(css).toContain('border-color: var(--lc-waiting-line)')
    expect(css).toContain('background: var(--lc-paid-soft)')

    // Иконки статуса живут в `ORDER_STATUS_ICONS`, локальной копии у чипа нет.
    expect(chip).toContain('ORDER_STATUS_ICONS')
    expect(chip).not.toContain('const ICONS = {')

    // У каждого статуса словаря есть иконка: иначе сегмент/чип молча теряет значок
    // (в разметке иконка идёт «как есть» из пропсов Quasar, а не с фолбэком).
    for (const status of [...ORDER_STATUSES, { value: 'unknown' }]) {
      expect(ORDER_STATUS_ICONS[status.value], `нет иконки для ${status.value}`).toBeTruthy()
    }
  })

  it('порядок сегментов в переключателе совпадает со словарём ORDER_STATUSES', () => {
    // Сдвиг индикатора (`--lc-toggle-shift`) = индекс статуса в `ORDER_STATUSES`,
    // поэтому перестановка словаря не «уронит» заливку на чужой сегмент молча.
    const shiftOf = status => {
      const block = header.match(new RegExp(`\\.lc-toggle--${status}\\s*\\{[^}]*\\}`))
      expect(block, `нет правил .lc-toggle--${status}`).toBeTruthy()

      const shift = block[0].match(/--lc-toggle-shift:\s*(\d+)/)
      expect(shift, `нет --lc-toggle-shift у ${status}`).toBeTruthy()

      return Number(shift[1])
    }

    expect(ORDER_STATUSES.map(item => shiftOf(item.value))).toEqual([0, 1, 2])
  })
})

describe('Правка живого прогона: создание позиции — одной кнопкой', () => {
  it('в карточке заказа нет плавающей кнопки-дубля создания', () => {
    // Дефект: на вкладке «работы» дублировалось «Новая работа» — кнопка в панели
    // (`OrderServicesPanel`) плюс тот же FAB в `OrderDetailsPage`. FAB убран: страница
    // объявляет свой `QLayout` без нижнего таббара, поэтому `.lc-fab` (76px) «висел».
    const page = read('src/pages/OrderDetailsPage.vue')

    expect(page).not.toContain('<LcFab')
    expect(page).not.toContain('LcFab.vue')
  })

  it('на вкладке «работы» осталась одна кнопка создания', () => {
    const panel = read('src/components/order/OrderServicesPanel.vue')

    expect(panel.match(/Новая \$\{t\('service'\)\}/g)).toHaveLength(1)
  })
})
