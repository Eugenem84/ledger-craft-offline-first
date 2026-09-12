// src/domain/presets/auto.js
//
// Пресет «автосервис» (Фаза 10, задача 10.4, решение D5).
// Объект опознаётся по VIN/госномеру (`equipmentIdentifier`, задача 10.9).
export default {
  key: 'auto',
  label: 'Автосервис',
  icon: 'directions_car',
  accent: '#ff7043',
  version: 1,
  lexicon: { part: 'запчасть', model: 'автомобиль', equipmentIdentifier: 'VIN / госномер' },
  features: { store: true, models: true, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'to',
      name: 'ТО',
      services: [
        { name: 'Замена масла', price: 1500 },
        { name: 'Замена фильтров', price: 1200 },
        { name: 'Диагностика ходовой', price: 1000 },
      ],
    },
    {
      key: 'brakes',
      name: 'Тормозная система',
      services: [
        { name: 'Замена колодок', price: 2500 },
        { name: 'Замена дисков', price: 4000 },
        { name: 'Прокачка тормозов', price: 2000 },
      ],
    },
    {
      key: 'engine',
      name: 'Двигатель',
      services: [
        { name: 'Замена ремня ГРМ', price: 8000 },
        { name: 'Замена свечей', price: 2000 },
        { name: 'Промывка форсунок', price: 3500 },
      ],
    },
    {
      key: 'electric',
      name: 'Электрика',
      services: [
        { name: 'Диагностика электрики', price: 1500 },
        { name: 'Замена аккумулятора', price: 500 },
        { name: 'Установка сигнализации', price: 5000 },
      ],
    },
    {
      key: 'geometry',
      name: 'Развал-схождение',
      services: [{ name: 'Развал-схождение', price: 3000 }],
    },
  ],
  productCategories: [
    { key: 'spares', name: 'Запчасти' },
    { key: 'fluids', name: 'Масла и жидкости' },
    { key: 'chemistry', name: 'Автохимия' },
    { key: 'tires', name: 'Шины и диски' },
  ],
  models: [
    { key: 'sedan', name: 'Седан' },
    { key: 'hatchback', name: 'Хэтчбек' },
    { key: 'crossover', name: 'Кроссовер' },
    { key: 'suv', name: 'Внедорожник' },
    { key: 'minivan', name: 'Минивэн' },
  ],
};
