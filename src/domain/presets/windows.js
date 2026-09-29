// src/domain/presets/windows.js
//
// Пресет «окна и двери» (расширение реестра ниш, Фаза 10/задача 10.4).
// Объект опознаётся адресом (`equipmentIdentifier`), «модели техники» скрыты.
export default {
  key: 'windows',
  label: 'Окна и двери',
  icon: 'window',
  accent: '#00acc1',
  version: 1,
  lexicon: { model: 'изделие', equipmentIdentifier: 'адрес объекта' },
  features: { store: true, models: false, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'windows',
      name: 'Окна',
      services: [
        { name: 'Регулировка окна', price: 1200 },
        { name: 'Замена уплотнителя', price: 1000 },
        { name: 'Замена стеклопакета', price: 3500 },
        { name: 'Замена ручки', price: 700 },
      ],
    },
    {
      key: 'doors',
      name: 'Двери',
      services: [
        { name: 'Установка двери', price: 4500 },
        { name: 'Регулировка двери', price: 900 },
        { name: 'Замена замка', price: 2000 },
        { name: 'Установка доводчика', price: 1500 },
      ],
    },
    {
      key: 'nets',
      name: 'Москитные сетки',
      services: [
        { name: 'Изготовление сетки', price: 1800 },
        { name: 'Установка сетки', price: 500 },
      ],
    },
    {
      key: 'balconies',
      name: 'Балконы',
      services: [
        { name: 'Остекление балкона', price: 25000 },
        { name: 'Отделка балкона', price: 15000 },
      ],
    },
  ],
  productCategories: [
    { key: 'fittings', name: 'Фурнитура' },
    { key: 'seals', name: 'Уплотнители' },
    { key: 'nets-goods', name: 'Сетки' },
    { key: 'consumables', name: 'Расходники' },
  ],
  models: [
    { key: 'pvc-window', name: 'Окно ПВХ' },
    { key: 'pvc-door', name: 'Дверь ПВХ' },
    { key: 'balcony', name: 'Балконный блок' },
  ],
};
