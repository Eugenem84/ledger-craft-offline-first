// test/presets.test.js
//
// Фаза 10 (задача 10.4): пресеты как контент. Проверяем форму (категории → работы
// с ценами, категории товаров, модели) и метаданные UI (лексикон, акцент, флаги),
// чтобы новый пресет нельзя было добавить «полупустым».
import { describe, it, expect } from 'vitest'
import { PRESETS, PRESET_KEYS, getPreset, hasPreset, presetOptions } from 'src/domain/presets/index.js'
import { LEXICONS } from 'src/domain/lexicon.js'
import { DEFAULT_FEATURES } from 'src/domain/features.js'

const KNOWN_FEATURES = Object.keys(DEFAULT_FEATURES)

describe('10.4 Пресеты специализаций', () => {
  it('четыре ниши v1 и уникальные ключи', () => {
    expect(PRESET_KEYS).toEqual(['bike', 'aquarium', 'hvac', 'auto'])
    expect(new Set(PRESET_KEYS).size).toBe(PRESET_KEYS.length)
  })

  it('getPreset/hasPreset отвечают по ключу', () => {
    expect(getPreset('bike')?.label).toBe('Ремонт велосипедов')
    expect(getPreset('nope')).toBeNull()
    expect(hasPreset('auto')).toBe(true)
    expect(hasPreset('nope')).toBe(false)
  })

  it('у каждого пресета есть акцент, иконка и версия', () => {
    for (const preset of PRESETS) {
      expect(preset.accent, preset.key).toMatch(/^#[0-9a-f]{6}$/i)
      expect(typeof preset.icon, preset.key).toBe('string')
      expect(typeof preset.version, preset.key).toBe('number')
    }
  })

  it('категории работ содержат работы с именем и ценой', () => {
    for (const preset of PRESETS) {
      expect(preset.categories.length, preset.key).toBeGreaterThan(0)

      for (const category of preset.categories) {
        expect(typeof category.key, `${preset.key}/${category.key}`).toBe('string')
        expect(typeof category.name, `${preset.key}/${category.key}`).toBe('string')
        expect(Array.isArray(category.services)).toBe(true)
        expect(category.services.length).toBeGreaterThan(0)

        for (const service of category.services) {
          expect(typeof service.name).toBe('string')
          expect(typeof service.price).toBe('number')
        }
      }
    }
  })

  it('ключи элементов внутри пресета уникальны (нужно для template_key)', () => {
    for (const preset of PRESETS) {
      const keys = [
        ...preset.categories.map(item => `cat:${item.key}`),
        ...preset.productCategories.map(item => `pc:${item.key}`),
        ...preset.models.map(item => `model:${item.key}`),
      ]
      expect(new Set(keys).size, preset.key).toBe(keys.length)
    }
  })

  it('категории товаров и модели заданы', () => {
    for (const preset of PRESETS) {
      expect(preset.productCategories.length, preset.key).toBeGreaterThan(0)
      expect(preset.models.length, preset.key).toBeGreaterThan(0)

      for (const category of preset.productCategories) {
        expect(typeof category.name).toBe('string')
      }
      for (const model of preset.models) {
        expect(typeof model.name).toBe('string')
      }
    }
  })

  it('лексикон пресета — только известные термины', () => {
    for (const preset of PRESETS) {
      expect(LEXICONS[preset.key], preset.key).toBeDefined()
      for (const term of Object.keys(preset.lexicon)) {
        expect(Object.keys(LEXICONS[preset.key])).toContain(term)
      }
    }
  })

  it('флаги пресета — только известные, значения boolean', () => {
    for (const preset of PRESETS) {
      for (const [flag, value] of Object.entries(preset.features)) {
        expect(KNOWN_FEATURES, `${preset.key}/${flag}`).toContain(flag)
        expect(typeof value, `${preset.key}/${flag}`).toBe('boolean')
      }
    }
  })

  it('флаги иллюстрируют критерий 10.3: у аквариумов нет склада, у hvac — моделей', () => {
    expect(getPreset('aquarium').features.store).toBe(false)
    expect(getPreset('hvac').features.models).toBe(false)
    expect(getPreset('bike').features.store).toBe(true)
  })

  it('presetOptions отдаёт только метаданные для пикера', () => {
    const options = presetOptions()

    expect(options).toHaveLength(4)
    expect(options[0]).toEqual({
      key: 'bike',
      label: 'Ремонт велосипедов',
      icon: 'pedal_bike',
      accent: '#4caf50',
    })
  })
})
