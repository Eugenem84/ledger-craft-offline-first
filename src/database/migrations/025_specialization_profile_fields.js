// Поля рабочего профиля специализации (Фаза 10, задача 10.6, решение D4/D5).
//
// «Специализация» — это рабочий профиль мастерской, а не тип аккаунта: к ней
// привязаны заказы, клиенты и каталог. Чтобы профиль «говорил на языке» ниши,
// ему нужны метаданные UI. Они хранятся на сервере и проходят через синк
// (иначе не переживут `fullReset` и не приедут на второе устройство):
//   • preset_key       — какой пресет применён (`bike`/`aquarium`/`hvac`/`auto`);
//   • accent           — акцентный цвет (применяется через `setCssVar`);
//   • features         — JSON-флаги видимости вкладок/блоков;
//   • archived         — архив вместо физического удаления (у серверных
//     `categories`/`product_categories` FK `onDelete('cascade')` — удаление
//     профиля снесло бы весь каталог);
//   • template_version — версия применённого пресета (для «дотянуть» контент
//     без перезаписи правок пользователя).
//
// Миграция идемпотентна: ALTER идемпотентным не бывает, поэтому колонки
// добавляются через `PRAGMA table_info` (на свежих БД также из CREATE TABLE).

import { addColumnIfMissing } from './add-column.js'

export default {
  id: '025_specialization_profile_fields',

  up: async (db) => {
    await addColumnIfMissing(db, 'specializations', 'preset_key', 'TEXT')
    await addColumnIfMissing(db, 'specializations', 'accent', 'TEXT')
    await addColumnIfMissing(db, 'specializations', 'features', 'TEXT')
    await addColumnIfMissing(db, 'specializations', 'archived', 'INTEGER DEFAULT 0')
    await addColumnIfMissing(db, 'specializations', 'template_version', 'INTEGER')
  },

  down: async () => {
    // SQLite не умеет удалять колонки (до 3.35 — только через пересоздание таблицы),
    // а локальная БД миграции не откатывает (см. `src/boot/db.js`).
  },
};
