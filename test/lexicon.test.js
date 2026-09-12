// test/lexicon.test.js
//
// Фаза 10 (задача 10.1): лексикон терминов. Слова приходят из одного словаря,
// фолбэк — общий, схема/синк не затронуты. Термины проверяются без Vue/Pinia:
// чистые функции `getLexicon`/`translate`.
import { describe, it, expect } from 'vitest'
import { DEFAULT_LEXICON, LEXICONS, LEXICON_KEYS, getLexicon, translate } from 'src/domain/lexicon.js'
import { PRESETS } from 'src/domain/presets/index.js'

describe('10.1 Лексикон терминов', () => {
  it('без пресета отдаёт общий словарь', () => {
    expect(getLexicon(null)).toEqual({ ...DEFAULT_LEXICON })
    expect(getLexicon(undefined)).toEqual({ ...DEFAULT_LEXICON })
  })

  it('неизвестный пресет не ломает словарь (фолбэк на общий)', () => {
    expect(getLexicon('unknown-niche')).toEqual({ ...DEFAULT_LEXICON })
  })

  it('пресет подменяет слова ниши, остальные берёт из общего', () => {
    const bike = getLexicon('bike')

    expect(bike.part).toBe('запчасть')
    expect(bike.model).toBe('велосипед')
    // Ключ, которого нет в пресете, остаётся общим.
    expect(bike.order).toBe(DEFAULT_LEXICON.order)
    expect(bike.client).toBe(DEFAULT_LEXICON.client)
  })

  it('auto — «автомобиль», hvac — «объект» (критерий 10.1)', () => {
    expect(getLexicon('auto').model).toBe('автомобиль')
    expect(getLexicon('hvac').model).toBe('объект')
    expect(getLexicon('auto').part).toBe('запчасть')
  })

  it('в словаре любого пресета есть все ключи лексикона', () => {
    for (const key of [null, ...Object.keys(LEXICONS)]) {
      const lexicon = getLexicon(key)
      for (const term of LEXICON_KEYS) {
        expect(typeof lexicon[term], `${key}/${term}`).toBe('string')
        expect(lexicon[term].length).toBeGreaterThan(0)
      }
    }
  })

  it('translate знает ключ и не прячет неизвестный', () => {
    expect(translate('part', 'bike')).toBe('запчасть')
    expect(translate('equipmentIdentifier', 'auto')).toBe('VIN / госномер')
    expect(translate('no-such-key', 'bike')).toBe('no-such-key')
  })

  it('у каждого пресета есть клиентский словарь (10.1 покрывает все ниши v1)', () => {
    for (const preset of PRESETS) {
      expect(LEXICONS[preset.key], `лексикон для ${preset.key}`).toBeDefined()
    }
  })
})
