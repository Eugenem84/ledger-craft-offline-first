// src/domain/presets/appliance.js
//
// Пресет «ремонт бытовой техники» (расширение реестра ниш, Фаза 10/задача 10.4).
// Объект — прибор, опознаётся по серийному номеру; «модели техники» = тип прибора.
export default {
  key: 'appliance',
  label: 'Ремонт бытовой техники',
  icon: 'home_repair_service',
  accent: '#8e24aa',
  version: 1,
  lexicon: { model: 'прибор', equipmentIdentifier: 'серийный номер' },
  features: { store: true, models: true, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'washing',
      name: 'Стиральные машины',
      services: [
        { name: 'Диагностика', price: 800 },
        { name: 'Замена подшипника', price: 4500 },
        { name: 'Замена насоса', price: 2500 },
        { name: 'Чистка фильтра', price: 1000 },
        { name: 'Замена ремня', price: 1800 },
      ],
    },
    {
      key: 'fridges',
      name: 'Холодильники',
      services: [
        { name: 'Замена компрессора', price: 6500 },
        { name: 'Заправка фреоном', price: 4000 },
        { name: 'Замена термостата', price: 2500 },
        { name: 'Устранение утечки', price: 3500 },
      ],
    },
    {
      key: 'dishwashers',
      name: 'Посудомоечные машины',
      services: [
        { name: 'Замена помпы', price: 2800 },
        { name: 'Прочистка форсунок', price: 2000 },
        { name: 'Замена уплотнителя', price: 1500 },
      ],
    },
    {
      key: 'stoves',
      name: 'Плиты и духовки',
      services: [
        { name: 'Замена нагревателя', price: 2200 },
        { name: 'Замена термопары', price: 1800 },
        { name: 'Ремонт электроники', price: 3000 },
      ],
    },
    {
      key: 'microwaves',
      name: 'Микроволновки',
      services: [
        { name: 'Замена магнетрона', price: 3200 },
        { name: 'Замена слюды', price: 1200 },
      ],
    },
  ],
  productCategories: [
    { key: 'spares', name: 'Запчасти' },
    { key: 'consumables', name: 'Расходники' },
    { key: 'fasteners', name: 'Крепёж' },
    { key: 'tools', name: 'Инструмент' },
  ],
  models: [
    { key: 'washer', name: 'Стиральная машина' },
    { key: 'fridge', name: 'Холодильник' },
    { key: 'dishwasher', name: 'Посудомоечная машина' },
    { key: 'stove', name: 'Плита' },
    { key: 'microwave', name: 'Микроволновка' },
  ],
};
