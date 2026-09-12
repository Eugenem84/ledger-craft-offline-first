// test/phase12-profile.test.js
//
// Фаза 12, задачи 12.1–12.3. Продуктовая полировка профилей и карточки заказа:
//   • 12.1 — специализацию можно только ВЫБРАТЬ из доступных пресетов (свой профиль
//     «без пресета» создать нельзя), каталог появляется сразу;
//   • 12.2 — у существующего профиля нет UI-пути менять `name`/`preset_key`;
//   • 12.3 — в карточке заказа статус/оплата управляются одним органом (переключатели).
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

describe('12.1/12.2 UI «Ещё»: выбор профиля, без переименования и смены пресета', () => {
  const page = read('src/pages/OthersPage.vue')

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

  it('остались переключатель статуса и кнопка «оплачено»', () => {
    expect(header.match(/<q-btn-toggle\s/g)).toHaveLength(1)
    expect(header).toContain('@update:model-value="value => emit(\'update:status\', value)"')
    expect(header).toContain('@click="emit(\'update:paid\', !paid)"')
  })
})
