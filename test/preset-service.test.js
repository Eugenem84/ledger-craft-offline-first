// test/preset-service.test.js
//
// Фаза 10 (задача 10.7): пресеты на сервере + офлайн-кэш. Проверяем разбор
// ответа/кэша, слияние серверного контента с локальными метаданными UI и
// фолбэк на клиентский JSON, когда сети/кэша нет.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from './helpers/testDb.js'
import * as metaRepo from 'src/repositories/metaRepo.js'
import {
  TEMPLATES_META_KEY,
  parseTemplates,
  contentFromTemplates,
  mergePreset,
  getCachedTemplates,
  refreshTemplates,
  resolvePreset,
} from 'src/services/presetService.js'
import { getPreset } from 'src/domain/presets/index.js'

const serverContent = {
  preset_key: 'bike',
  version: 5,
  content: {
    categories: [{ key: 'wheels', name: 'Колёса (с сервера)', services: [{ name: 'Правка', price: 999 }] }],
    productCategories: [{ key: 'spares', name: 'Запчасти' }],
    models: [{ key: 'mtb', name: 'Горный' }],
  },
}

describe('10.7 Пресеты на сервере + офлайн-кэш', () => {
  beforeEach(async () => {
    await setupTestDb()
  })

  it('parseTemplates понимает массив, обёртку {templates} и JSON-строку', () => {
    expect(parseTemplates([serverContent])).toHaveLength(1)
    expect(parseTemplates({ templates: [serverContent] })).toHaveLength(1)
    expect(parseTemplates(JSON.stringify([serverContent]))).toHaveLength(1)
  })

  it('parseTemplates не роняет онбординг на мусоре', () => {
    expect(parseTemplates(null)).toEqual([])
    expect(parseTemplates('{oops')).toEqual([])
    expect(parseTemplates({ nope: true })).toEqual([])
    // Записи без preset_key отбрасываются.
    expect(parseTemplates([{ content: {} }, serverContent])).toHaveLength(1)
  })

  it('contentFromTemplates находит контент по ключу', () => {
    expect(contentFromTemplates([serverContent], 'bike')).toEqual(serverContent.content)
    expect(contentFromTemplates([serverContent], 'auto')).toBeNull()
    expect(contentFromTemplates(null, 'bike')).toBeNull()
  })

  it('mergePreset меняет только каталог, метаданные UI остаются локальными', () => {
    const local = getPreset('bike')
    const merged = mergePreset(local, serverContent.content)

    expect(merged.categories[0].name).toBe('Колёса (с сервера)')
    expect(merged.accent).toBe(local.accent)
    expect(merged.features).toEqual(local.features)
    expect(merged.lexicon).toEqual(local.lexicon)
    expect(merged.key).toBe('bike')
  })

  it('mergePreset не подменяет каталог пустыми массивами и терпит отсутствие контента', () => {
    const local = getPreset('bike')

    expect(mergePreset(local, { categories: [] }).categories).toEqual(local.categories)
    expect(mergePreset(local, null)).toBe(local)
    expect(mergePreset(null, serverContent.content)).toBeNull()
  })

  it('refreshTemplates кладёт ответ сервера в read-only кэш `meta`', async () => {
    const api = { get: vi.fn().mockResolvedValue({ data: { templates: [serverContent] } }) }

    const templates = await refreshTemplates({ api })
    expect(api.get).toHaveBeenCalledWith('/specialization-templates')
    expect(templates).toHaveLength(1)

    // Читаем тот же кэш так, как это делал бы офлайн-старт.
    expect(await getCachedTemplates()).toHaveLength(1)
    expect(await metaRepo.getValue(TEMPLATES_META_KEY)).toContain('bike')
  })

  it('resolvePreset без кэша отдаёт клиентский JSON (офлайн-фолбэк)', async () => {
    const preset = await resolvePreset('bike')

    expect(preset).toBe(getPreset('bike'))
  })

  it('resolvePreset после refresh применяет серверный контент', async () => {
    await refreshTemplates({
      api: { get: vi.fn().mockResolvedValue({ data: { templates: [serverContent] } }) },
    })

    const preset = await resolvePreset('bike')
    expect(preset.categories[0].name).toBe('Колёса (с сервера)')
    expect(preset.accent).toBe(getPreset('bike').accent)
  })

  it('resolvePreset не знает неизвестный ключ', async () => {
    expect(await resolvePreset('unknown-niche')).toBeNull()
  })

  it('битый кэш не мешает применению пресета', async () => {
    await metaRepo.setValue(TEMPLATES_META_KEY, '{not-json')

    const preset = await resolvePreset('bike')
    expect(preset).toBe(getPreset('bike'))
  })
})
