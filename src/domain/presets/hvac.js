// src/domain/presets/hvac.js
//
// Пресет «установка и обслуживание кондиционеров» (Фаза 10, задача 10.4, решение D5).
// «Модели техники» (features.models) не нужны: объект опознаётся адресом
// (`equipmentIdentifier`), а не моделью — пример второго флага видимости (10.3).
export default {
  key: 'hvac',
  label: 'Кондиционеры и вентиляция',
  icon: 'ac_unit',
  accent: '#42a5f5',
  version: 1,
  lexicon: { part: 'запчасть', model: 'объект', equipmentIdentifier: 'адрес объекта' },
  features: { store: true, models: false, analytics: true, shareLink: true, equipmentIdentifier: true },
  categories: [
    {
      key: 'install',
      name: 'Монтаж',
      services: [
        { name: 'Монтаж кондиционера', price: 8000 },
        { name: 'Демонтаж кондиционера', price: 3000 },
        { name: 'Прокладка трассы', price: 2500 },
      ],
    },
    {
      key: 'maintenance',
      name: 'Обслуживание',
      services: [
        { name: 'Чистка кондиционера', price: 2500 },
        { name: 'Дозаправка фреона', price: 3000 },
        { name: 'Проверка давления', price: 1500 },
      ],
    },
    {
      key: 'repair',
      name: 'Ремонт',
      services: [
        { name: 'Поиск утечки', price: 2000 },
        { name: 'Замена компрессора', price: 7000 },
        { name: 'Ремонт платы управления', price: 3500 },
      ],
    },
    {
      key: 'diagnostics',
      name: 'Диагностика',
      services: [
        { name: 'Диагностика неисправности', price: 1500 },
        { name: 'Замер параметров', price: 1000 },
      ],
    },
  ],
  productCategories: [
    { key: 'spares', name: 'Запчасти' },
    { key: 'consumables', name: 'Расходники' },
    { key: 'install-materials', name: 'Материалы монтажа' },
  ],
  models: [
    { key: 'wall-split', name: 'Настенный сплит' },
    { key: 'multi-split', name: 'Мульти-сплит' },
    { key: 'duct', name: 'Канальный' },
    { key: 'vrf', name: 'Мультизональный VRF' },
  ],
};
