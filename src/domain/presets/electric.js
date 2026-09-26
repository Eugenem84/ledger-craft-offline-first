// src/domain/presets/electric.js
//
// Пресет «электрик» (расширение реестра ниш, Фаза 10/задача 10.4).
// Объект опознаётся адресом (`equipmentIdentifier`), поэтому «модели техники»
// не нужны — вместо них список моделей остаётся только для совместимости формы
// пресета (скрыт флагом `features.models`).
export default {
  key: 'electric',
  label: 'Электрик',
  icon: 'electrical_services',
  accent: '#fbc02d',
  version: 1,
  lexicon: { part: 'комплектующая', model: 'объект', equipmentIdentifier: 'адрес объекта' },
  features: { store: true, models: false, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'sockets',
      name: 'Розетки и выключатели',
      services: [
        { name: 'Установка розетки', price: 600 },
        { name: 'Замена выключателя', price: 500 },
        { name: 'Перенос розетки', price: 900 },
      ],
    },
    {
      key: 'panel',
      name: 'Щиток',
      services: [
        { name: 'Сборка щитка', price: 3500 },
        { name: 'Установка автомата', price: 500 },
        { name: 'Установка УЗО', price: 900 },
      ],
    },
    {
      key: 'wiring',
      name: 'Проводка',
      services: [
        { name: 'Прокладка кабеля', price: 300 },
        { name: 'Замена проводки (точка)', price: 1200 },
        { name: 'Штробление стены', price: 400 },
      ],
    },
    {
      key: 'lighting',
      name: 'Освещение',
      services: [
        { name: 'Установка люстры', price: 1200 },
        { name: 'Установка точечного светильника', price: 500 },
        { name: 'Монтаж LED-ленты', price: 800 },
      ],
    },
    {
      key: 'faults',
      name: 'Поиск неисправностей',
      services: [
        { name: 'Диагностика проводки', price: 1500 },
        { name: 'Поиск обрыва', price: 2000 },
      ],
    },
  ],
  productCategories: [
    { key: 'cable', name: 'Кабель и провода' },
    { key: 'breakers', name: 'Автоматы и УЗО' },
    { key: 'sockets-goods', name: 'Розетки и выключатели' },
    { key: 'lights', name: 'Светильники' },
  ],
  models: [
    { key: 'apartment', name: 'Квартира' },
    { key: 'house', name: 'Частный дом' },
    { key: 'office', name: 'Офис' },
    { key: 'garage', name: 'Гараж' },
  ],
};
