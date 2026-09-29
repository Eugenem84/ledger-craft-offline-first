// src/domain/presets/computer.js
//
// Пресет «компьютерная помощь» (расширение реестра ниш, Фаза 10/задача 10.4).
// Объект — устройство заказчика; «модели техники» = тип устройства.
export default {
  key: 'computer',
  label: 'Компьютерная помощь',
  icon: 'computer',
  accent: '#3949ab',
  version: 1,
  lexicon: { model: 'устройство', equipmentIdentifier: 'серийный номер' },
  features: { store: true, models: true, analytics: true, shareLink: true, equipmentIdentifier: false },
  categories: [
    {
      key: 'setup',
      name: 'Настройка и ПО',
      services: [
        { name: 'Установка Windows', price: 1500 },
        { name: 'Настройка программ', price: 1200 },
        { name: 'Удаление вирусов', price: 1500 },
        { name: 'Настройка роутера', price: 1200 },
      ],
    },
    {
      key: 'hardware',
      name: 'Железо',
      services: [
        { name: 'Замена SSD', price: 1500 },
        { name: 'Установка ОЗУ', price: 1000 },
        { name: 'Замена блока питания', price: 1500 },
        { name: 'Сборка ПК', price: 3500 },
      ],
    },
    {
      key: 'data',
      name: 'Данные',
      services: [
        { name: 'Восстановление данных', price: 3000 },
        { name: 'Перенос данных', price: 1500 },
        { name: 'Резервное копирование', price: 1000 },
      ],
    },
    {
      key: 'maintenance',
      name: 'Обслуживание',
      services: [
        { name: 'Чистка от пыли', price: 1800 },
        { name: 'Замена термопасты', price: 1500 },
        { name: 'Установка охлаждения', price: 2000 },
      ],
    },
  ],
  productCategories: [
    { key: 'components', name: 'Комплектующие' },
    { key: 'peripherals', name: 'Периферия' },
    { key: 'consumables', name: 'Расходники' },
    { key: 'software-goods', name: 'ПО и лицензии' },
  ],
  models: [
    { key: 'laptop', name: 'Ноутбук' },
    { key: 'desktop', name: 'Системный блок' },
    { key: 'all-in-one', name: 'Моноблок' },
    { key: 'router', name: 'Роутер' },
  ],
};
