// src/domain/presets/furniture.js
//
// Пресет «мебель: сборка и ремонт» (расширение реестра ниш, Фаза 10/задача 10.4).
// Объект — предмет мебели, отдельный идентификатор объекта не нужен (флаг скрыт).
export default {
  key: 'furniture',
  label: 'Мебель: сборка и ремонт',
  icon: 'chair',
  accent: '#8d6e63',
  version: 1,
  lexicon: { model: 'предмет мебели', equipmentIdentifier: 'номер заказа' },
  features: { store: true, models: false, analytics: true, shareLink: true, equipmentIdentifier: false },
  categories: [
    {
      key: 'assembly',
      name: 'Сборка',
      services: [
        { name: 'Сборка шкафа', price: 2500 },
        { name: 'Сборка кухни', price: 5000 },
        { name: 'Сборка кровати', price: 1800 },
        { name: 'Сборка стола', price: 1200 },
      ],
    },
    {
      key: 'repair',
      name: 'Ремонт',
      services: [
        { name: 'Замена петель', price: 800 },
        { name: 'Замена направляющих', price: 1200 },
        { name: 'Ремонт столешницы', price: 2000 },
      ],
    },
    {
      key: 'hanging',
      name: 'Навеска',
      services: [
        { name: 'Навеска шкафа', price: 1500 },
        { name: 'Навеска полки', price: 500 },
        { name: 'Монтаж зеркала', price: 1000 },
      ],
    },
    {
      key: 'custom',
      name: 'Изготовление',
      services: [
        { name: 'Изготовление полки', price: 2500 },
        { name: 'Изготовление стола', price: 8000 },
        { name: 'Распил ЛДСП', price: 500 },
      ],
    },
  ],
  productCategories: [
    { key: 'fittings', name: 'Фурнитура' },
    { key: 'fasteners', name: 'Крепёж' },
    { key: 'blanks', name: 'ЛДСП и заготовки' },
    { key: 'consumables', name: 'Расходники' },
  ],
  models: [
    { key: 'wardrobe', name: 'Шкаф' },
    { key: 'kitchen', name: 'Кухня' },
    { key: 'bed', name: 'Кровать' },
    { key: 'table', name: 'Стол' },
  ],
};
