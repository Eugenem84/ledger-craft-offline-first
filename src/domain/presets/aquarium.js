// src/domain/presets/aquarium.js
//
// Пресет «мастер по аквариумам» (Фаза 10, задача 10.4, решение D5).
// Склад (`features.store`) этому профилю не нужен — пример флага видимости вкладок (10.3).
export default {
  key: 'aquarium',
  label: 'Мастер по аквариумам',
  icon: 'water',
  accent: '#26c6da',
  version: 1,
  lexicon: { part: 'товар', model: 'аквариум', equipmentIdentifier: 'номер аквариума' },
  features: { store: false, models: true, analytics: true, shareLink: true, equipmentIdentifier: false },
  categories: [
    {
      key: 'maintenance',
      name: 'Чистка и обслуживание',
      services: [
        { name: 'Чистка аквариума', price: 1500 },
        { name: 'Замена воды', price: 800 },
        { name: 'Чистка фильтра', price: 700 },
      ],
    },
    {
      key: 'water',
      name: 'Вода и тесты',
      services: [
        { name: 'Тест воды', price: 400 },
        { name: 'Коррекция pH', price: 600 },
        { name: 'Восстановление азотного цикла', price: 1200 },
      ],
    },
    {
      key: 'equipment',
      name: 'Оборудование',
      services: [
        { name: 'Установка фильтра', price: 1200 },
        { name: 'Установка освещения', price: 1500 },
        { name: 'Замена ламп', price: 500 },
      ],
    },
    {
      key: 'setup',
      name: 'Запуск и заселение',
      services: [
        { name: 'Запуск аквариума', price: 3000 },
        { name: 'Акваскейп', price: 5000 },
        { name: 'Заселение рыбой', price: 1000 },
      ],
    },
    {
      key: 'treatment',
      name: 'Лечение',
      services: [
        { name: 'Диагностика болезней', price: 800 },
        { name: 'Лечение ихтиофтириоза', price: 1000 },
      ],
    },
  ],
  productCategories: [
    { key: 'food', name: 'Корма' },
    { key: 'equipment-goods', name: 'Оборудование' },
    { key: 'chemistry', name: 'Химия' },
    { key: 'accessories', name: 'Аксессуары' },
  ],
  models: [
    { key: 'nano', name: 'Нано 30 л' },
    { key: 'planted', name: 'Травник 100 л' },
    { key: 'cichlid', name: 'Цихлидник 150 л' },
    { key: 'marine', name: 'Морской 200 л' },
  ],
};
