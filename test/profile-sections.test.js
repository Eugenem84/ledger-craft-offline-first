// test/profile-sections.test.js
//
// Доработка Фазы 10 (задача 10.3): разделы рабочего профиля настраивает пользователь.
//
// Раньше карточка «разделы профиля» в «Ещё» была read-only: флаги приходили из пресета
// и менялись только при создании профиля. Теперь тумблеры пишут `specializations.features`
// текущей специализации — тот же JSON, что уезжает синком при онбординге, — а состав
// вкладок (`MainLayout.vue`) и блоков заказа читает те же флаги через `resolveFeatures`.
//
// Плюс из каталога убрана кнопка «Начать с шаблона»: профиль и так создаётся из пресета
// с готовым каталогом (Фаза 12, 12.1), повторное применение пресета — легаси-путь.
//
// Логика проверяется на настоящем sql.js (`test/helpers/testDb.js`), UI — структурно
// по исходникам `.vue` (в проекте нет @vue/test-utils).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { DEFAULT_FEATURES, FEATURE_LABELS, FEATURE_HINTS, resolveFeatures } from 'src/domain/features.js'
import { createFeatureGuard, FEATURE_FALLBACK_PATH } from 'src/router/authGuard.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

describe('10.3 Доработка: пользователь сам настраивает разделы профиля', () => {
  beforeEach(async () => {
    await setupTestDb()
    setActivePinia(createPinia())
  })

  it('setFeatures пишет флаги в профиль и они переживают перечитывание', async () => {
    const store = useSpecializationsStore()
    const id = await store.createFromPreset('bike')

    await store.setFeatures(id, { ...resolveFeatures(store.getSelectedSpecialization), store: false })

    const row = await db.queryOne('SELECT features FROM specializations WHERE id = ?', [id])
    expect(resolveFeatures({ features: row.features }).store).toBe(false)

    // Перечитывание профиля не теряет выбор и не включает обратно остальные разделы.
    await store.load()
    const features = resolveFeatures(store.getSelectedSpecialization)
    expect(features.store).toBe(false)
    expect(features.analytics).toBe(true)
  })

  it('выключенный раздел закрыт и для прямого перехода (featureGuard)', async () => {
    const store = useSpecializationsStore()
    const id = await store.createFromPreset('bike')

    await store.setFeatures(id, { ...resolveFeatures(store.getSelectedSpecialization), store: false })

    const guard = createFeatureGuard({
      getSpecialization: () => store.getSelectedSpecialization,
      ensureLoaded: async () => {},
    })

    await expect(guard({ path: '/store', meta: { feature: 'store' } })).resolves.toEqual({
      path: FEATURE_FALLBACK_PATH,
    })
  })

  it('включение обратно возвращает раздел', async () => {
    const store = useSpecializationsStore()
    const id = await store.createFromPreset('aquarium')

    // У аквариумов склад выключен пресетом — включаем вручную.
    expect(resolveFeatures(store.getSelectedSpecialization).store).toBe(false)
    await store.setFeatures(id, { ...resolveFeatures(store.getSelectedSpecialization), store: true })
    expect(resolveFeatures(store.getSelectedSpecialization).store).toBe(true)
  })
})

describe('10.3 Доработка UI: тумблеры разделов и каталог без старта из пресета', () => {
  // Разделы профиля живут во вкладке «разделы профиля» окна настроек: страница «ещё»
  // убрана правкой владельца 17.09.2026 (`components/settings/SettingsDialog.vue`).
  const settings = read('src/components/settings/SettingsDialog.vue')
  const catalog = read('src/pages/CatalogPage.vue')

  it('в настройках разделы включаются тумблерами, а не показываются read-only', () => {
    expect(settings).toContain('setFeature')
    expect(settings).toContain('FEATURE_HINTS')
    expect(settings).toMatch(/v-for="\(label, flag\) in FEATURE_LABELS"/)
    expect(settings).toMatch(/<q-toggle[\s\S]{0,200}:model-value="activeFeatures\[flag\]/)
    expect(settings).toContain('@update:model-value="value => setFeature(flag, value)"')
    expect(settings).not.toContain("activeFeatures[flag] ? 'включено' : 'скрыто'")
  })

  it('в каталоге нет старта из шаблона', () => {
    expect(catalog).not.toContain('startFromTemplate')
    expect(catalog).not.toContain('templateBusy')
    expect(catalog).not.toContain('label="Начать с шаблона"')
  })

  it('флаги store/shareLink реально скрывают блоки заказа', () => {
    const order = read('src/pages/OrderDetailsPage.vue')
    const header = read('src/components/order/OrderHeaderActions.vue')
    const materials = read('src/components/order/OrderMaterialsPanel.vue')

    expect(order).toContain(':show-share="isEnabled(\'shareLink\')"')
    expect(order).toContain(':show-store-products="isEnabled(\'store\')"')
    expect(header).toContain('showShare')
    expect(header).toContain('v-if="showShare"')
    expect(materials).toContain('showStoreProducts')
    expect(materials).toContain('v-if="props.showStoreProducts"')
  })

  it('у каждого флага есть подпись и пояснение для тумблера', () => {
    for (const flag of Object.keys(DEFAULT_FEATURES)) {
      expect(FEATURE_LABELS[flag], `${flag}: label`).toBeTruthy()
      expect(FEATURE_HINTS[flag], `${flag}: hint`).toBeTruthy()
    }
  })
})
