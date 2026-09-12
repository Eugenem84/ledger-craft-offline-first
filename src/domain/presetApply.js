// src/domain/presetApply.js
//
// Материализация пресета в мастерскую (Фаза 10, задача 10.4, решение D5).
//
// Правила из решения D5:
//   • **клонируем, а не ссылаемся** — применение создаёт обычные записи мастерской
//     с пометкой `template_key`; дальше пользователь правит их свободно;
//   • **идемпотентность** — повторное применение не дублирует каталог: перед
//     вставкой ищем пару `(specialization_id, template_key)`;
//   • материализация идёт через репозитории (правило 8.2: в `*.vue` нет вызовов
//     `*Repo`), поэтому пресетный сервис — доменный слой, а не экран.
//
// Категории работ → услуги, категории товаров и модели создаются в порядке
// «родитель → ребёнок». Данные ложится в очередь синка одним батчем — порядок
// волн (`syncService`) это выдерживает, но у батча онбординга есть отдельный тест.
import * as categoriesRepo from 'src/repositories/categoriesRepo.js';
import * as servicesRepo from 'src/repositories/servicesRepo.js';
import * as productCategoriesRepo from 'src/repositories/productCategoriesRepo.js';
import * as modelsRepo from 'src/repositories/modelsRepo.js';

/** Репозитории по умолчанию (в тестах можно подменить). */
export const DEFAULT_REPOS = Object.freeze({
  categories: categoriesRepo,
  services: servicesRepo,
  productCategories: productCategoriesRepo,
  models: modelsRepo,
});

/**
 * Ключ идемпотентности записи пресета.
 *
 * @param {string} presetKey `bike` / `aquarium` / …
 * @param {string} itemKey ключ элемента внутри пресета (`wheels`, `spares`, …)
 * @returns {string} например `bike:wheels`
 */
export function templateKey(presetKey, itemKey) {
  return `${presetKey}:${itemKey}`;
}

/** Пустая сводка результата. */
function emptyResult() {
  return {
    created: { categories: 0, services: 0, productCategories: 0, models: 0 },
    skipped: { categories: 0, productCategories: 0, models: 0 },
  };
}

/**
 * Применяет пресет к специализации. Безопасно вызывать повторно.
 *
 * @param {object} input
 * @param {object} input.preset пресет из `src/domain/presets`
 * @param {string} input.specializationId локальный UUID специализации
 * @param {object} [input.repos] подмена репозиториев (тесты)
 * @returns {Promise<{created: object, skipped: object, specializationId: string, presetKey: string}>}
 */
export async function materializePreset({ preset, specializationId, repos = DEFAULT_REPOS }) {
  if (!preset) throw new Error('materializePreset: не передан пресет');
  if (!specializationId) throw new Error('materializePreset: не передан specializationId');

  const result = emptyResult();

  // 1. Категории работ + услуги.
  for (const category of preset.categories || []) {
    const key = templateKey(preset.key, category.key);
    const existing = await repos.categories.findByTemplateKey(specializationId, key);

    if (existing) {
      result.skipped.categories += 1;
      continue;
    }

    const categoryId = await repos.categories.save({
      specialization_id: specializationId,
      category_name: category.name,
      template_key: key,
    });
    result.created.categories += 1;

    for (const service of category.services || []) {
      await repos.services.save({
        category_id: categoryId,
        service: service.name,
        price: service.price ?? 0,
      });
      result.created.services += 1;
    }
  }

  // 2. Категории товаров.
  for (const category of preset.productCategories || []) {
    const key = templateKey(preset.key, category.key);
    const existing = await repos.productCategories.findByTemplateKey(specializationId, key);

    if (existing) {
      result.skipped.productCategories += 1;
      continue;
    }

    await repos.productCategories.save({
      specialization_id: specializationId,
      name: category.name,
      template_key: key,
    });
    result.created.productCategories += 1;
  }

  // 3. Модели техники.
  for (const model of preset.models || []) {
    const key = templateKey(preset.key, model.key);
    const existing = await repos.models.findByTemplateKey(specializationId, key);

    if (existing) {
      result.skipped.models += 1;
      continue;
    }

    await repos.models.save({
      name: model.name,
      specialization_id: specializationId,
      template_key: key,
    });
    result.created.models += 1;
  }

  return { ...result, specializationId, presetKey: preset.key };
}
