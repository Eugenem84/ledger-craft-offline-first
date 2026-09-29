// src/domain/presets/cleaning.js
//
// Пресет «клининг» (расширение реестра ниш, Фаза 10/задача 10.4).
// Склад и «модели техники» не нужны — примеры флагов видимости разделов (10.3);
// объект опознаётся адресом (`equipmentIdentifier`).
export default {
  key: 'cleaning',
  label: 'Клининг',
  icon: 'cleaning_services',
  accent: '#26a69a',
  version: 1,
  lexicon: { model: 'объект', equipmentIdentifier: 'адрес объекта' },
  features: { store: false, models: false, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'premises',
      name: 'Уборка помещений',
      services: [
        { name: 'Поддерживающая уборка', price: 3000 },
        { name: 'Генеральная уборка', price: 6000 },
        { name: 'Уборка после ремонта', price: 9000 },
      ],
    },
    {
      key: 'windows',
      name: 'Окна',
      services: [
        { name: 'Мойка окна', price: 800 },
        { name: 'Мойка витрины', price: 1500 },
      ],
    },
    {
      key: 'furniture',
      name: 'Мебель и текстиль',
      services: [
        { name: 'Химчистка дивана', price: 3500 },
        { name: 'Химчистка ковра', price: 2500 },
        { name: 'Химчистка матраса', price: 2000 },
      ],
    },
    {
      key: 'special',
      name: 'Спецработы',
      services: [
        { name: 'Дезинфекция', price: 4000 },
        { name: 'Уборка снега', price: 2000 },
      ],
    },
  ],
  productCategories: [
    { key: 'chemistry', name: 'Химия и средства' },
    { key: 'inventory', name: 'Инвентарь' },
    { key: 'consumables', name: 'Расходники' },
  ],
  models: [
    { key: 'flat', name: 'Квартира' },
    { key: 'house', name: 'Дом' },
    { key: 'office', name: 'Офис' },
    { key: 'shop', name: 'Магазин' },
  ],
};
