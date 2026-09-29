// src/domain/presets/plumbing.js
//
// Пресет «сантехник» (расширение реестра ниш, Фаза 10/задача 10.4).
// Объект обслуживания — адрес (`equipmentIdentifier`), «модели техники» скрыты.
export default {
  key: 'plumbing',
  label: 'Сантехник',
  icon: 'plumbing',
  accent: '#039be5',
  version: 1,
  lexicon: { model: 'объект', equipmentIdentifier: 'адрес объекта' },
  features: { store: true, models: false, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'mixers',
      name: 'Смесители и краны',
      services: [
        { name: 'Замена смесителя', price: 1200 },
        { name: 'Замена картриджа смесителя', price: 800 },
        { name: 'Установка шарового крана', price: 700 },
        { name: 'Устранение течи', price: 900 },
      ],
    },
    {
      key: 'toilets',
      name: 'Унитазы и ванны',
      services: [
        { name: 'Установка унитаза', price: 3500 },
        { name: 'Замена бачка', price: 2000 },
        { name: 'Установка ванны', price: 6000 },
        { name: 'Замена сифона', price: 900 },
      ],
    },
    {
      key: 'pipes',
      name: 'Трубы и разводка',
      services: [
        { name: 'Замена участка трубы', price: 1500 },
        { name: 'Разводка труб (точка)', price: 2500 },
        { name: 'Установка фильтра воды', price: 1500 },
      ],
    },
    {
      key: 'clogs',
      name: 'Прочистка засоров',
      services: [
        { name: 'Прочистка засора', price: 2000 },
        { name: 'Гидродинамическая прочистка', price: 4500 },
      ],
    },
    {
      key: 'boilers',
      name: 'Водонагреватели',
      services: [
        { name: 'Установка бойлера', price: 4000 },
        { name: 'Замена ТЭНа', price: 2500 },
      ],
    },
  ],
  productCategories: [
    { key: 'pipes-goods', name: 'Трубы и фитинги' },
    { key: 'mixers-goods', name: 'Смесители и краны' },
    { key: 'sanitary', name: 'Санфаянс' },
    { key: 'consumables', name: 'Расходники' },
  ],
  models: [
    { key: 'apartment', name: 'Квартира' },
    { key: 'house', name: 'Частный дом' },
    { key: 'office', name: 'Офис' },
    { key: 'country', name: 'Дача' },
  ],
};
