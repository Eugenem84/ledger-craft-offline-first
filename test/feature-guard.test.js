// test/feature-guard.test.js
//
// Фаза 10 (задача 10.3): прямой переход по URL на скрытый пресетом раздел не
// открывает пустой экран — guard уводит на доступный раздел. Проверяется чистой
// фабрикой `createFeatureGuard` с подставными зависимостями (без router/Pinia/Vue).
import { describe, it, expect, vi } from 'vitest'
import { createFeatureGuard, FEATURE_FALLBACK_PATH } from 'src/router/authGuard.js'

const guardFor = (specialization, extra = {}) =>
  createFeatureGuard({
    getSpecialization: () => specialization,
    ensureLoaded: vi.fn(async () => {}),
    ...extra,
  })

const route = (path, meta = {}) => ({ path, meta })

describe('10.3 feature-guard', () => {
  it('раздел без meta.feature пропускается всегда', async () => {
    expect(await guardFor({ preset_key: 'aquarium' })(route('/orders'))).toBe(true)
  })

  it('раздел доступен, если флаг включён', async () => {
    expect(await guardFor({ preset_key: 'bike' })(route('/store', { feature: 'store' }))).toBe(true)
  })

  it('скрытый раздел уводит на доступный (/orders)', async () => {
    expect(await guardFor({ preset_key: 'aquarium' })(route('/store', { feature: 'store' }))).toEqual(
      { path: FEATURE_FALLBACK_PATH }
    )
  })

  it('профиль без пресета/полей — всё доступно', async () => {
    expect(await guardFor(null)(route('/store', { feature: 'store' }))).toBe(true)
  })

  it('уважает собственные флаги специализации', async () => {
    const specialization = { preset_key: 'bike', features: '{"analytics":false}' }
    expect(await guardFor(specialization)(route('/analytic', { feature: 'analytics' }))).toEqual({
      path: FEATURE_FALLBACK_PATH,
    })
  })

  it('не мешает навигации, если профиль не прочитался (офлайн)', async () => {
    const guard = createFeatureGuard({
      getSpecialization: () => null,
      ensureLoaded: vi.fn(async () => {
        throw new Error('offline')
      }),
    })

    expect(await guard(route('/store', { feature: 'store' }))).toBe(true)
  })

  it('fallback можно переопределить (тесты/кастомные разделы)', async () => {
    const guard = createFeatureGuard({
      getSpecialization: () => ({ preset_key: 'aquarium' }),
      ensureLoaded: async () => {},
      fallbackPath: '/catalog',
    })

    expect(await guard(route('/store', { feature: 'store' }))).toEqual({ path: '/catalog' })
  })
})
