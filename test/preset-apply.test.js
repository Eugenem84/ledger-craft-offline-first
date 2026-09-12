// test/preset-apply.test.js
//
// Фаза 10 (задача 10.4): материализация пресета. Критерий: каталог появляется
// одним действием, повторное применение не создаёт дублей, порядок операций —
// «родитель → ребёнок» (услуга не уезжает раньше своей категории).
import { describe, it, expect, beforeEach } from 'vitest'
import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import { materializePreset, templateKey } from 'src/domain/presetApply.js'
import { getPreset } from 'src/domain/presets/index.js'

async function queue() {
  const rows = await db.query('SELECT *, rowid AS _rowid FROM operations ORDER BY _rowid ASC')
  return rows.map(row => ({ ...row, payload: JSON.parse(row.payload) }))
}

const count = async table => {
  const [{ total }] = await db.query(`SELECT COUNT(*) AS total FROM ${table}`)
  return Number(total)
}

describe('10.4 Материализация пресета', () => {
  let specializationId

  beforeEach(async () => {
    await setupTestDb()
    specializationId = await specializationsRepo.save({ name: 'Веломастерская' })
  })

  it('создаёт категории, работы, категории товаров и модели с template_key', async () => {
    const preset = getPreset('bike')
    const result = await materializePreset({ preset, specializationId })

    expect(result.created.categories).toBe(preset.categories.length)
    expect(result.created.services).toBe(
      preset.categories.reduce((sum, category) => sum + category.services.length, 0)
    )
    expect(result.created.productCategories).toBe(preset.productCategories.length)
    expect(result.created.models).toBe(preset.models.length)

    const categories = await db.query('SELECT * FROM categories WHERE specialization_id = ?', [
      specializationId,
    ])
    expect(categories).toHaveLength(preset.categories.length)
    expect(categories.every(row => row.template_key?.startsWith('bike:'))).toBe(true)
    expect(categories.map(row => row.template_key)).toContain(templateKey('bike', 'wheels'))

    const services = await db.query('SELECT * FROM services')
    expect(services).toHaveLength(result.created.services)

    const productCategories = await db.query(
      'SELECT * FROM product_categories WHERE specialization_id = ?',
      [specializationId]
    )
    expect(productCategories.every(row => row.template_key?.startsWith('bike:'))).toBe(true)

    const models = await db.query('SELECT * FROM equipment_models WHERE specialization_id = ?', [
      specializationId,
    ])
    expect(models).toHaveLength(preset.models.length)
    expect(models.every(row => row.template_key?.startsWith('bike:'))).toBe(true)
  })

  it('повторное применение идемпотентно: нет дублей, всё помечено как пропущенное', async () => {
    const preset = getPreset('bike')
    const first = await materializePreset({ preset, specializationId })
    const second = await materializePreset({ preset, specializationId })

    expect(second.created).toEqual({ categories: 0, services: 0, productCategories: 0, models: 0 })
    expect(second.skipped).toEqual({
      categories: preset.categories.length,
      productCategories: preset.productCategories.length,
      models: preset.models.length,
    })

    expect(await count('categories')).toBe(first.created.categories)
    expect(await count('services')).toBe(first.created.services)
    expect(await count('product_categories')).toBe(first.created.productCategories)
    expect(await count('equipment_models')).toBe(first.created.models)
  })

  it('порядок «родитель → ребёнок»: услуги ссылаются на созданные локально категории', async () => {
    await materializePreset({ preset: getPreset('bike'), specializationId })

    const categories = await db.query('SELECT id FROM categories WHERE specialization_id = ?', [
      specializationId,
    ])
    const categoryIds = new Set(categories.map(row => row.id))
    const services = await db.query('SELECT * FROM services')

    expect(services.length).toBeGreaterThan(0)
    for (const service of services) {
      expect(categoryIds.has(service.category_id), `services.category_id=${service.category_id}`).toBe(
        true
      )
    }

    // В очереди категории стоят раньше работ: иначе сервер отверг бы ребёнка-«сироту».
    const operations = await queue()
    const firstCategory = operations.findIndex(op => op.table === 'categories')
    const firstService = operations.findIndex(op => op.table === 'services')

    expect(firstCategory).toBeGreaterThanOrEqual(0)
    expect(firstService).toBeGreaterThan(firstCategory)
  })

  it('материализация разных пресетов в одну специализацию не конфликтует по ключам', async () => {
    await materializePreset({ preset: getPreset('bike'), specializationId })
    const auto = await materializePreset({ preset: getPreset('auto'), specializationId })

    expect(auto.created.categories).toBe(getPreset('auto').categories.length)
    // Ключи `template_key` включают пресет, поэтому обе ниши сосуществуют.
    expect(await count('categories')).toBe(
      getPreset('bike').categories.length + getPreset('auto').categories.length
    )
  })

  it('без специализации/пресета бросает понятную ошибку', async () => {
    await expect(materializePreset({ preset: null, specializationId })).rejects.toThrow()
    await expect(
      materializePreset({ preset: getPreset('bike'), specializationId: null })
    ).rejects.toThrow()
  })
})
