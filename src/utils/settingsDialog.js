// src/utils/settingsDialog.js
//
// Открытие окна настроек из любого места приложения (правка владельца 17.09.2026).
//
// Настройки — не раздел, а модальное окно (`components/settings/SettingsDialog.vue`), которое
// рендерит каркас (`layouts/MainLayout.vue`). Точки входа: кнопка-шестерёнка в таббаре, строка
// «Профиль и настройки» в шапке и ссылка из пустого состояния каталога («Управление профилями»).
// Последняя живёт на другой странице, поэтому состояние окна вынесено в этот маленький модуль —
// как `utils/devMode.js` и `utils/reportSettings.js`: обычные `ref` без Pinia, которые читаются
// и вне инициализации сторов.
//
// Зачем окну вкладка: открывать его всегда на первой вкладке — значит заставлять пользователя
// искать нужный раздел заново, когда он пришёл из конкретного места (из каталога — в «разделы
// профиля»/«специализацию», из шапки — в «специализацию»).
import { ref } from 'vue'

/** Открыто ли окно настроек. */
export const settingsDialogOpen = ref(false)

/** Вкладка, на которой окно откроется (`specialization`, `sections`, `reports`, …). */
export const settingsDialogTab = ref('')

/** Открывает окно настроек; по умолчанию — вкладка «специализация». */
export function openSettings(tab = 'specialization') {
  settingsDialogTab.value = tab
  settingsDialogOpen.value = true
}

/** Закрывает окно (то же делает кнопка «Отмена»/крестик внутри окна). */
export function closeSettings() {
  settingsDialogOpen.value = false
}
