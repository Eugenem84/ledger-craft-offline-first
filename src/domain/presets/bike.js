// src/domain/presets/bike.js
//
// Пресет «ремонт велосипедов» (Фаза 10, задача 10.4, решение D5).
//
// Пресет = стартовый каталог (категории работ → услуги с примерными ценами,
// категории товаров, модели техники) + метаданные UI (лексикон, акцент, флаги
// вкладок). Это **контент**, а не код: применение клонирует записи в мастерскую,
// дальше пользователь правит их свободно.
export default {
  key: 'bike',
  label: 'Ремонт велосипедов',
  icon: 'pedal_bike',
  accent: '#4caf50',
  version: 1,
  lexicon: { part: 'запчасть', model: 'велосипед', equipmentIdentifier: 'серийный номер рамы' },
  features: { store: true, models: true, analytics: true, shareLink: true, equipmentIdentifier: false },
  categories: [
    {
      key: 'wheels',
      name: 'Колёса',
      services: [
        { name: 'Замена камеры', price: 400 },
        { name: 'Замена покрышки', price: 500 },
        { name: 'Правка обода', price: 900 },
        { name: 'Сборка колеса', price: 2000 },
      ],
    },
    {
      key: 'brakes',
      name: 'Тормоза',
      services: [
        { name: 'Замена колодок', price: 600 },
        { name: 'Регулировка тормозов', price: 500 },
        { name: 'Прокачка гидравлики', price: 1500 },
      ],
    },
    {
      key: 'drivetrain',
      name: 'Трансмиссия',
      services: [
        { name: 'Замена цепи', price: 500 },
        { name: 'Замена кассеты', price: 1200 },
        { name: 'Регулировка переключения', price: 700 },
        { name: 'Замена троса', price: 600 },
      ],
    },
    {
      key: 'service',
      name: 'Обслуживание',
      services: [
        { name: 'Полное ТО', price: 3500 },
        { name: 'Чистка и смазка', price: 1500 },
        { name: 'Замена тросиков и рубашек', price: 1800 },
      ],
    },
    {
      key: 'fork',
      name: 'Рулевая и вилка',
      services: [
        { name: 'Замена вилки', price: 2500 },
        { name: 'Регулировка рулевой', price: 800 },
      ],
    },
  ],
  productCategories: [
    { key: 'spares', name: 'Запчасти' },
    { key: 'consumables', name: 'Расходники' },
    { key: 'accessories', name: 'Аксессуары' },
  ],
  models: [
    { key: 'mtb', name: 'Горный (MTB)' },
    { key: 'road', name: 'Шоссейный' },
    { key: 'city', name: 'Городской' },
    { key: 'bmx', name: 'BMX' },
    { key: 'e-bike', name: 'Электровелосипед' },
  ],
};
