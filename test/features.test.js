// test/features.test.js
//
// Фаза 10 (задача 10.3): флаги видимости вкладок/блоков. Проверяем нормализацию
// (из JSON-строки БД или объекта), приоритет полей специализации над пресетом
// и фолбэк «включено всё» для профиля без пресета.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FEATURES,
  FEATURE_LABELS,
  FEATURE_HINTS,
  normalizeFeatures,
  serializeFeatures,
  resolveFeatures,
} from 'src/domain/features.js'
import { getPreset } from 'src/domain/presets/index.js'

describe('10.3 Флаги видимости по пресету', () => {
  it('пустое значение — всё включено', () => {
    expect(normalizeFeatures(null)).toEqual({ ...DEFAULT_FEATURES })
    expect(normalizeFeatures(undefined)).toEqual({ ...DEFAULT_FEATURES })
    expect(normalizeFeatures('')).toEqual({ ...DEFAULT_FEATURES })
  })

  it('частичный JSON добивается значениями по умолчанию', () => {
    const features = normalizeFeatures('{"store":false}')

    expect(features.store).toBe(false)
    expect(features.analytics).toBe(true)
    expect(features.equipmentIdentifier).toBe(true)
  })

  it('битый JSON не роняет приложение — возвращает дефолт', () => {
    expect(normalizeFeatures('{oops')).toEqual({ ...DEFAULT_FEATURES })
    expect(normalizeFeatures([1, 2, 3])).toEqual({ ...DEFAULT_FEATURES })
  })

  it('объект и сериализация дают одно и то же (хранение в TEXT)', () => {
    const features = { store: false, models: false }
    const stored = serializeFeatures(features)

    expect(typeof stored).toBe('string')
    expect(normalizeFeatures(stored)).toEqual({
      ...DEFAULT_FEATURES,
      store: false,
      models: false,
    })
  })

  it('поля специализации важнее пресета', () => {
    const specialization = { preset_key: 'bike', features: '{"store":false}' }
    // У bike склад включён, но в самой специализации он выключен.
    expect(resolveFeatures(specialization).store).toBe(false)
  })

  it('без полей специализации берём флаги пресета (критерий 10.3)', () => {
    expect(resolveFeatures({ preset_key: 'aquarium' }).store).toBe(false)
    expect(resolveFeatures({ preset_key: 'hvac' }).models).toBe(false)
    expect(resolveFeatures({ preset_key: 'bike' }).store).toBe(true)
  })

  it('профиль без пресета и без полей — всё включено', () => {
    expect(resolveFeatures(null)).toEqual({ ...DEFAULT_FEATURES })
    expect(resolveFeatures({ preset_key: 'unknown' })).toEqual({ ...DEFAULT_FEATURES })
  })

  it('все флаги имеют человекочитаемую подпись и пояснение для тумблера', () => {
    for (const flag of Object.keys(DEFAULT_FEATURES)) {
      expect(FEATURE_LABELS[flag], flag).toBeTruthy()
      expect(FEATURE_HINTS[flag], flag).toBeTruthy()
    }
  })

  it('аквариумы действительно отключают склад (согласованность с пресетом)', () => {
    expect(getPreset('aquarium').features.store).toBe(false)
  })
})
