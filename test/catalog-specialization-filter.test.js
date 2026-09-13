// test/catalog-specialization-filter.test.js
//
// Регрессия на дефект «фреон в аквариумах»: каталог и справочники читались
// через `getAll()`, поэтому в профиль одной ниши попадали категории, клиенты и
// модели всех профилей (например, «Дозаправка фреона» из пресета `hvac` в
// профиле `aquarium`). Данные при этом лежали правильно — перепутано было чтение.
//
// Здесь фиксируем: строгий фильтр по активной специализации (сторы + репозитории),
// учёт серверного id после синка и разовую миграцию 029, которая привязывает
// «ничьи» записи (созданные до Фазы 10 без `specialization_id`) к профилю.
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import db from 'src/database/db.js'
import { setupTestDb } from './helpers/testDb.js'

import { materializePreset } from 'src/domain/presetApply.js'
import { getPreset } from 'src/domain/presets/index.js'

import * as specializationsRepo from 'src/repositories/specializationsRepo.js'
import * as categoriesRepo from 'src/repositories/categoriesRepo.js'
import * as servicesRepo from 'src/repositories/servicesRepo.js'
import * as clientsRepo from 'src/repositories/clientsRepo.js'
import * as modelsRepo from 'src/repositories/modelsRepo.js'

import { useCategoriesStore } from 'src/stores/useCategoriesStore.js'
import { useClientsStore } from 'src/stores/useClientsStore.js'
import { useModelsStore } from 'src/stores/useModelsStore.js'

import m029 from 'src/database/migrations/029_backfill_catalog_specialization.js'

/** Профиль с материализованным пресетом — тот же путь, что `createFromPreset`. */
async function seedProfile(presetKey) {
  const preset = getPreset(presetKey)
  const id = await specializationsRepo.save({ name: preset.label, preset_key: presetKey })
  await materializePreset({ preset, specializationId: id })
  return id
}

/** Все названия работ активного профиля (услуги берём через его категории). */
async function serviceNamesFor(specializationId) {
  const categories = await categoriesRepo.getBySpecializationId(specializationId)
  const names = []

  for (const category of categories) {
    const services = await servicesRepo.getByCategoryId(category.id)
    names.push(...services.map(service => service.service))
  }

  return names
}

beforeEach(async () => {
  await setupTestDb()
  setActivePinia(createPinia())
})

describe('Каталог строго по активному профилю (Фаза 10)', () => {
  it('в аквариумах не видно работ кондиционеров (регрессия «Дозаправка фреона»)', async () => {
    const aquariumId = await seedProfile('aquarium')
    const hvacId = await seedProfile('hvac')

    const aquariumServices = await serviceNamesFor(aquariumId)
    const hvacServices = await serviceNamesFor(hvacId)

    // Контроль: в данных работа кондиционеров есть — значит, чинили чтение.
    expect(hvacServices).toContain('Дозаправка фреона')
    expect(aquariumServices).not.toContain('Дозаправка фреона')

    const store = useCategoriesStore()
    await store.load(aquariumId)

    expect(store.items).toHaveLength(getPreset('aquarium').categories.length)
    expect(store.items.every(category => category.specialization_id === aquariumId)).toBe(true)
    expect(store.items.map(category => category.category_name)).not.toContain('Обслуживание')

    // Переключение профиля меняет и каталог, а не только лексикон с акцентом.
    await store.load(hvacId)
    expect(store.items.map(category => category.category_name)).toContain('Обслуживание')
    expect(store.items.every(category => category.specialization_id === hvacId)).toBe(true)
  })

  it('клиенты и модели техники фильтруются по профилю', async () => {
    const aquariumId = await seedProfile('aquarium')
    const hvacId = await seedProfile('hvac')

    await clientsRepo.save({ name: 'Аквариумист', specialization_id: aquariumId })
    await clientsRepo.save({ name: 'Кондиционерщик', specialization_id: hvacId })
    await modelsRepo.save({ name: 'Мой кубик', specialization_id: aquariumId })
    await modelsRepo.save({ name: 'Офисный сплит', specialization_id: hvacId })

    const clientsStore = useClientsStore()
    await clientsStore.load(aquariumId)
    expect(clientsStore.items.map(client => client.name)).toEqual(['Аквариумист'])

    const modelsStore = useModelsStore()
    await modelsStore.load(aquariumId)

    // В списке — модели пресета аквариумов и своя, но ничего из кондиционеров
    // (у `hvac` есть одноимённая по смыслу «Настенный сплит»).
    const aquariumModels = modelsStore.items.map(model => model.name)
    expect(aquariumModels).toContain('Мой кубик')
    expect(aquariumModels).not.toContain('Офисный сплит')
    expect(aquariumModels).not.toContain('Настенный сплит')
    expect(modelsStore.items.every(model => model.specialization_id === aquariumId)).toBe(true)
  })

  it('после синка фильтр находит записи по серверному id специализации', async () => {
    const aquariumId = await seedProfile('aquarium')
    await specializationsRepo.updateServerId(aquariumId, 42)

    // Имитируем синк: `applyServerRecord` пишет в `categories.specialization_id`
    // серверный id (парной колонки `specialization_server_id` у категорий нет).
    await db.execute('UPDATE categories SET specialization_id = ?', [42])

    const store = useCategoriesStore()
    await store.load(aquariumId)

    expect(store.items).toHaveLength(getPreset('aquarium').categories.length)
  })
})

describe('Миграция 029: привязка «ничьих» записей к профилю', () => {
  it('проставляет единственной специализации и идемпотентна', async () => {
    const specializationId = await specializationsRepo.save({ name: 'Ремонт' })

    await categoriesRepo.save({ category_name: 'Старое', specialization_id: null })
    await clientsRepo.save({ name: 'Старый клиент' })
    await modelsRepo.save({ name: 'Старая модель' })

    await m029.up(db)

    const category = await db.queryOne('SELECT * FROM categories WHERE category_name = ?', ['Старое'])
    const client = await db.queryOne('SELECT * FROM clients WHERE name = ?', ['Старый клиент'])
    const model = await db.queryOne('SELECT * FROM equipment_models WHERE name = ?', ['Старая модель'])

    expect(category.specialization_id).toBe(specializationId)
    expect(client.specialization_id).toBe(specializationId)
    expect(model.specialization_id).toBe(specializationId)

    // Повторный прогон безопасен: NULL-строк уже нет.
    await expect(m029.up(db)).resolves.toBeUndefined()

    // Записи снова видны строгому фильтру профиля.
    const store = useCategoriesStore()
    await store.load(specializationId)
    expect(store.items.map(item => item.category_name)).toContain('Старое')
  })
})

