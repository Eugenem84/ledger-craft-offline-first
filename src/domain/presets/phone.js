// src/domain/presets/phone.js
//
// Пресет «ремонт телефонов и ноутбуков» (расширение реестра ниш, Фаза 10/задача 10.4).
// Объект — устройство, опознаётся по IMEI/серийному номеру.
export default {
  key: 'phone',
  label: 'Ремонт телефонов и ноутбуков',
  icon: 'smartphone',
  accent: '#546e7a',
  version: 1,
  lexicon: { part: 'запчасть', model: 'устройство', equipmentIdentifier: 'IMEI / серийный номер' },
  features: { store: true, models: true, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'phones',
      name: 'Телефоны',
      services: [
        { name: 'Замена экрана', price: 3500 },
        { name: 'Замена аккумулятора', price: 1500 },
        { name: 'Замена разъёма зарядки', price: 1800 },
        { name: 'Замена камеры', price: 2000 },
      ],
    },
    {
      key: 'laptops',
      name: 'Ноутбуки',
      services: [
        { name: 'Замена клавиатуры', price: 2500 },
        { name: 'Замена матрицы', price: 4000 },
        { name: 'Чистка от пыли', price: 1800 },
        { name: 'Замена термопасты', price: 1500 },
      ],
    },
    {
      key: 'tablets',
      name: 'Планшеты',
      services: [
        { name: 'Замена тачскрина', price: 3000 },
        { name: 'Замена аккумулятора', price: 2200 },
      ],
    },
    {
      key: 'software',
      name: 'Программное',
      services: [
        { name: 'Переустановка ПО', price: 1200 },
        { name: 'Восстановление данных', price: 2500 },
        { name: 'Разблокировка', price: 1500 },
      ],
    },
    {
      key: 'diagnostics',
      name: 'Диагностика',
      services: [
        { name: 'Диагностика', price: 500 },
        { name: 'Чистка после влаги', price: 2500 },
      ],
    },
  ],
  productCategories: [
    { key: 'screens', name: 'Экраны и дисплеи' },
    { key: 'batteries', name: 'Аккумуляторы' },
    { key: 'connectors', name: 'Разъёмы и шлейфы' },
    { key: 'accessories', name: 'Аксессуары' },
  ],
  models: [
    { key: 'smartphone', name: 'Смартфон' },
    { key: 'tablet', name: 'Планшет' },
    { key: 'laptop', name: 'Ноутбук' },
    { key: 'smartwatch', name: 'Умные часы' },
  ],
};
