<script setup>
import { logger } from 'src/utils/logger'

import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import SyncService from '../services/syncService.js'
import { createBackup, getLastBackupAt, listBackups, restoreBackup } from 'src/services/backupService.js'
import { isNativePlatform } from 'src/utils/platform.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'
import { devModeEnabled, setDevMode } from 'src/utils/devMode.js'
import { PRESETS } from 'src/domain/presets/index.js'
import { resolveFeatures, FEATURE_LABELS, FEATURE_HINTS } from 'src/domain/features.js'
// Обратная связь (Фаза 14, задача 14.5): очередь отчётов «Сообщить об ошибке».
import feedbackService from 'src/services/feedbackService.js'
// Общие UI-элементы и подтверждение разрушительных действий (переработка интерфейса).
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import FeedbackDialogPage from 'pages/dialogs/FeedbackDialogPage.vue'
import LcPageHeader from 'src/components/ui/LcPageHeader.vue'
import LcSectionCard from 'src/components/ui/LcSectionCard.vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
// Обновление приложения (Фаза 13, задача 13.9). «Что нового» — списком пунктов
// через тире (правка владельца 15.09.2026; разбор строки — `utils/releaseNotes.js`).
import UpdateDialog from 'src/components/UpdateDialog.vue'
import { parseReleaseNotes } from 'src/utils/releaseNotes.js'

// «Режим разработчика» (задача 12.5; доработка). Панель доступна всегда, но
// подгружается лениво и показывается, только когда включён тумблер в настройках
// (`utils/devMode.js`). Так логи и диагностику можно снять прямо на боевом APK,
// где нет консоли разработчика. В обычной работе чанк панели не грузится.
const DeveloperPanel = defineAsyncComponent(() => import('src/components/dev/DeveloperPanel.vue'))

/** Тумблер: пишет флаг в storage, поэтому выбор переживает перезапуск. */
const devMode = computed({
  get: () => devModeEnabled.value,
  set: value => setDevMode(value),
})

const $q = useQuasar()
const router = useRouter()

const dangerConfirm = ref(null)

// Аккаунт (задача 7.4): видно, под кем работаем, и можно выйти.
const auth = useAuthStore()

const signOut = async () => {
  await auth.logout()
  await router.replace('/login')
}

// 1. Получаем экземпляр хранилища
const specializationsStore = useSpecializationsStore()

// --- Обновление приложения (Фаза 13, задачи 13.9/13.10) ----------------------
// Своя версия, статус фоновой проверки и кнопки «Проверить обновление» /
// «Обновить». Скачивание и системную установку показывает `UpdateDialog`.
const update = useUpdateStore()
const updateDialogOpen = ref(false)
const updateChecking = computed(() => update.status.checking)

/** Заметки релиза — пунктами списка (в тексте они склеены запятыми). */
const releaseNotes = computed(() => parseReleaseNotes(update.releaseNotes))

const checkUpdates = async () => {
  await update.checkNow()

  $q.notify({
    type: update.status.available ? 'info' : 'positive',
    message: update.statusText,
    position: 'top',
    timeout: 2500,
  })
}

// --- Управление рабочими профилями (Фаза 10, задача 10.8; Фаза 12, 12.1/12.2) ---
// Активный профиль переключается в шапке (`MainLayout.vue`). Здесь можно добавить
// **ещё одну** специализацию — только выбором из доступных ниш: у нового профиля
// сразу есть пресет (каталог/лексикон/флаги разделов), как при регистрации.
// Переименовать профиль или сменить его пресет нельзя (12.2). Архивируем, а не
// удаляем: у серверных `categories`/`product_categories` FK на `specializations`
// с `onDelete('cascade')`, физическое удаление снесло бы весь каталог.
const newProfilePreset = ref(null)
// Диалог выбора ниши: открывается кнопкой «+ специализация». Держим отдельным флагом,
// чтобы не открывать селектор в самой странице — на узком экране окно удобнее.
const newProfileDialogOpen = ref(false)
const busy = ref(false)

const openNewProfileDialog = () => {
  newProfilePreset.value = null
  newProfileDialogOpen.value = true
}

const activeSpecialization = computed(() => specializationsStore.getSelectedSpecialization)
const archivedItems = computed(() => specializationsStore.items.filter(item => item.archived))
const activeFeatures = computed(() => resolveFeatures(activeSpecialization.value))

/**
 * Тумблеры разделов (10.3; доработка): пользователь сам выбирает, какие разделы
 * нужны текущей специализации. Пишем в `specializations.features` — тот же JSON,
 * что при создании профиля, поэтому выбор уезжает синком как обычная правка.
 */
const setFeature = async (flag, value) => {
  const specialization = activeSpecialization.value
  if (!specialization) return

  try {
    await specializationsStore.setFeatures(specialization.id, {
      ...activeFeatures.value,
      [flag]: value,
    })
  } catch (error) {
    console.error('Ошибка сохранения разделов профиля:', error)
    $q.notify({
      type: 'negative',
      message: 'Не удалось сохранить разделы профиля',
      position: 'top',
      timeout: 1500,
    })
  }
}

const presetOptions = computed(() =>
  PRESETS.map(preset => ({ label: preset.label, value: preset.key, icon: preset.icon }))
)

const addProfile = async () => {
  if (!newProfilePreset.value) return

  busy.value = true
  try {
    await specializationsStore.createFromPreset(newProfilePreset.value)
    newProfilePreset.value = null
    newProfileDialogOpen.value = false
    $q.notify({
      type: 'positive',
      message: 'Специализация добавлена',
      position: 'top',
      timeout: 1200,
    })
  } catch (error) {
    console.error('Ошибка добавления специализации:', error)
    $q.notify({ type: 'negative', message: 'Не удалось добавить специализацию' })
  } finally {
    busy.value = false
  }
}

const archiveProfile = async () => {
  if (!activeSpecialization.value) return
  await specializationsStore.archive(activeSpecialization.value.id)
  $q.notify({
    type: 'positive',
    message: 'Профиль в архиве — его история сохранена',
    position: 'top',
    timeout: 1500,
  })
}

const restoreProfile = async id => {
  await specializationsStore.unarchive(id)
}

// Бэкап локальной БД (задача 4.4): на Android — файл в документах устройства,
// в браузере — скачивание дампа `.sqlite`.
const backupLoading = ref(false)
const lastBackupAtValue = ref(null)
const lastBackupAt = computed(() => {
  if (!lastBackupAtValue.value) return 'ещё не делался'
  return new Date(lastBackupAtValue.value).toLocaleString()
})

// 2. Создаем вычисляемое свойство для опций селекта
const specializationOptions = computed(() => specializationsStore.items.map(item => ({
  label: item.name,
  value: item.id
})))

// 3. Создаем вычисляемое свойство, связанное с хранилищем, для v-model
const selectedSpecialization = computed({
  get: () => specializationsStore.selectedId,
  set: (id) => specializationsStore.select(id)
})

// 4. Загружаем данные при монтировании компонента
onMounted(async () => {
  await specializationsStore.load() // Первая специализация будет выбрана по умолчанию в сторе
  lastBackupAtValue.value = await getLastBackupAt()
  await refreshFeedbackPending()
})

// --- Обратная связь (Фаза 14, задача 14.5) -----------------------------------
// Диалог сам показывает историю отчётов и статус отправки; странице остаётся
// открыть его и показать, сколько отчётов ещё лежит в очереди.
const feedbackDialog = ref(null)
const feedbackPending = ref(0)

async function refreshFeedbackPending() {
  try {
    feedbackPending.value = await feedbackService.pendingCount()
  } catch (error) {
    // Счётчик — не повод ломать страницу настроек: показываем ноль и пишем в лог.
    logger.warn('[Feedback] Не удалось прочитать очередь отчётов:', error?.message)
    feedbackPending.value = 0
  }
}

const openFeedback = () => {
  feedbackDialog.value?.open()
}

const sync = async () => {
  try {
    // Ручной повтор (задача 6.2/3.7): force игнорирует паузу после сбоя, чтобы кнопка
    // не казалась «мёртвой» в течение backoff.
    await SyncService.sync({ force: true })
    logger.log('Синхронизация завершена успешно.')
    await specializationsStore.load()
  } catch (error) {
    console.error('Ошибка при синхронизации:', error)
  }
}

// Разрушительные действия (полный сброс, удаление локальной БД) перенесены в
// «Режим разработчика» (`DeveloperPanel.vue`, задачи 12.4/12.5).

// Бэкап локальной БД (задача 4.4). На Android файл ляжет в документы устройства,
// в браузере дамп скачается файлом.
const makeBackup = async () => {
  backupLoading.value = true
  try {
    const backup = await createBackup()
    lastBackupAtValue.value = backup.createdAt
    $q.notify({
      type: 'positive',
      message: `Бэкап создан: ${backup.fileName}`,
      timeout: 4000,
    })
  } catch (error) {
    console.error('Ошибка при создании бэкапа:', error)
    $q.notify({ type: 'negative', message: `Не удалось создать бэкап: ${error.message}` })
  } finally {
    backupLoading.value = false
  }
}

// --- Восстановление из бэкапа (задача 11.9) -----------------------------------
// Это АВАРИЙНЫЙ путь без сервера: обычный перенос на новое устройство — это вход и
// синхронизация, а сюда идут, когда сервер потерян/недоступен или аккаунт удалён.
// Доступно только на устройстве: там бэкап — JSON. В браузере бэкап — дамп `.sqlite`
// (только выгрузка), поэтому восстановления для него нет.
const restoreAvailable = computed(() => isNativePlatform())
const restoreOpen = ref(false)
const restoreLoading = ref(false)
const backupOptions = ref([])
const selectedBackup = ref(null)

const openRestore = async () => {
  restoreLoading.value = true
  try {
    backupOptions.value = await listBackups()
    selectedBackup.value = backupOptions.value[0]?.fileName ?? null
    restoreOpen.value = true
  } catch (error) {
    console.error('Ошибка чтения списка бэкапов:', error)
    $q.notify({ type: 'negative', message: `Не удалось прочитать бэкапы: ${error.message}` })
  } finally {
    restoreLoading.value = false
  }
}

const confirmRestore = () => {
  const target = backupOptions.value.find(item => item.fileName === selectedBackup.value)
  if (!target) return

  restoreOpen.value = false

  // Разрушительное действие (замена всей БД) — подтверждаем отдельным диалогом.
  dangerConfirm.value.open(
    'Восстановить из бэкапа',
    'Текущая локальная база будет ПОЛНОСТЬЮ заменена данными из файла. Это аварийный путь без сервера — ' +
      'обычный перенос делается входом и синхронизацией. Продолжить?',
    async () => {
      restoreLoading.value = true
      // Синк на время замены БД останавливаем: он держит соединение и очередь операций.
      SyncService.stopAutoSync()

      try {
        const result = await restoreBackup({ fileName: target.fileName, directory: target.directory })
        $q.notify({
          type: 'positive',
          message: `Данные восстановлены из ${result.fileName}. Перезапустите приложение.`,
          timeout: 0, // не скрывать автоматически
          actions: [
            {
              label: 'Перезагрузить',
              color: 'white',
              handler: () => {
                window.location.reload()
              },
            },
          ],
        })
      } catch (error) {
        console.error('Ошибка восстановления из бэкапа:', error)
        SyncService.startAutoSync()
        $q.notify({ type: 'negative', message: `Не удалось восстановить: ${error.message}` })
      } finally {
        restoreLoading.value = false
      }
    }
  )
}

</script>

<template>
  <q-page class="lc-page lc-shell">
    <LcPageHeader title="ещё" subtitle="профили, шаблоны, данные и аккаунт" icon="tune" />

    <!-- Рабочие профили (Фаза 10, задача 10.8; Фаза 12, 12.1/12.2): переключение
         активного контекста, добавление ещё одной специализации из списка, архив.
         Переименования и смены пресета у существующего профиля нет. -->
    <LcSectionCard title="рабочий профиль" icon="badge">
      <div class="q-gutter-y-sm">
        <q-select
          v-model="selectedSpecialization"
          :loading="specializationsStore.loading"
          :options="specializationOptions"
          label="Переключить профиль"
          outlined
          dense
          emit-value
          map-options
          color="secondary"
        />

        <q-separator dark class="q-my-sm" />

        <!-- Кнопка вместо селектора прямо на странице: по нажатию открывается
             диалог с выбором ниши (задача 12.1/12.2). -->
        <q-btn
          class="full-width"
          no-caps
          unelevated
          color="secondary"
          text-color="black"
          icon="add"
          label="Добавить ещё одну специализацию"
          @click="openNewProfileDialog"
        />
        <div class="text-caption lc-mute">
          Выбрать можно только из доступных ниш — каталог и разделы появятся сразу.
        </div>

        <q-btn
          class="full-width"
          size="sm"
          no-caps
          flat
          color="warning"
          icon="archive"
          label="Архивировать текущий профиль"
          :disable="!activeSpecialization"
          @click="archiveProfile"
        />
        <div class="text-caption lc-mute">
          Профиль не удаляется: его история и заказы остаются на месте.
        </div>

        <template v-if="archivedItems.length">
          <q-separator dark class="q-my-sm" />
          <div class="lc-eyebrow">архив</div>
          <div
            v-for="item in archivedItems"
            :key="item.id"
            class="row items-center no-wrap q-mb-xs"
          >
            <div class="col lc-muted ellipsis">{{ item.name }}</div>
            <q-btn
              flat
              dense
              no-caps
              size="sm"
              color="secondary"
              label="вернуть"
              @click="restoreProfile(item.id)"
            />
          </div>
        </template>
      </div>
    </LcSectionCard>

    <!-- Разделы профиля (10.3; доработка): пользователь сам включает/выключает разделы
         текущей специализации. Значение пишется в `specializations.features` и уезжает
         синком — состав вкладок (`MainLayout.vue`) и блоков заказа читает те же флаги. -->
    <LcSectionCard title="разделы профиля" icon="tune">
      <div class="q-gutter-y-sm">
        <div class="text-caption lc-mute">
          Включите разделы, которые нужны этой специализации. Выбор применяется сразу
          и синхронизируется с сервером.
        </div>

        <div
          v-for="(label, flag) in FEATURE_LABELS"
          :key="flag"
          class="row items-center no-wrap"
        >
          <div class="col">
            <div class="lc-muted">{{ label }}</div>
            <div class="text-caption lc-mute">{{ FEATURE_HINTS[flag] }}</div>
          </div>
          <q-toggle
            :model-value="activeFeatures[flag] !== false"
            color="secondary"
            :disable="!activeSpecialization"
            @update:model-value="value => setFeature(flag, value)"
          />
        </div>

        <div v-if="!activeSpecialization" class="text-caption lc-mute">
          Нет активного профиля — сначала добавьте специализацию.
        </div>
      </div>
    </LcSectionCard>

    <!-- Обновление приложения (Фаза 13, задача 13.9): своя версия, статус проверки
         и кнопка «Обновить». Скачивание и системную установку ведёт `UpdateDialog`. -->
    <LcSectionCard title="приложение" icon="system_update">
      <div class="q-gutter-y-sm">
        <div class="row items-center no-wrap">
          <div class="col">
            <div class="lc-muted">Версия {{ update.currentLabel }}</div>
            <div class="text-caption lc-mute">{{ update.statusText }}</div>
          </div>
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="secondary"
            icon="refresh"
            label="проверить"
            :loading="updateChecking"
            @click="checkUpdates"
          />
        </div>

        <div v-if="releaseNotes.length" class="text-caption lc-mute">
          <div class="q-mb-xs">Что нового:</div>
          <div v-for="(note, index) in releaseNotes" :key="index">— {{ note }}</div>
        </div>

        <q-btn
          v-if="update.canUpdate"
          class="full-width"
          no-caps
          outline
          :color="update.view.kind === 'mandatory' ? 'deep-orange' : 'secondary'"
          icon="system_update_alt"
          :label="`Обновить до ${update.releaseLabel}`"
          @click="updateDialogOpen = true"
        />

        <div class="text-caption lc-mute">
          Файл обновления скачивается с сервера мастерской; данные и настройки сохраняются.
        </div>
      </div>
    </LcSectionCard>

    <!-- Синхронизация и бэкап: индикатор состояния живёт в шапке (`SyncStatusBar`). -->
    <LcSectionCard title="данные и синхронизация" icon="cloud_sync">
      <div class="q-gutter-y-sm">
        <q-btn
          class="full-width"
          no-caps
          outline
          color="secondary"
          icon="sync"
          label="Синхронизировать сейчас"
          @click="sync"
        />
        <q-btn
          class="full-width"
          no-caps
          outline
          color="secondary"
          icon="save_alt"
          label="Создать бэкап"
          :loading="backupLoading"
          @click="makeBackup"
        >
          <q-tooltip class="text-caption">
            Копия локальной базы: на Android — файл в документах, в браузере — скачивание
          </q-tooltip>
        </q-btn>
        <q-btn
          v-if="restoreAvailable"
          class="full-width"
          no-caps
          outline
          color="deep-orange"
          icon="settings_backup_restore"
          label="Восстановить из бэкапа"
          :loading="restoreLoading"
          @click="openRestore"
        >
          <q-tooltip class="text-caption">
            Аварийно, без сервера: заменяет локальную БД данными из JSON-бэкапа
          </q-tooltip>
        </q-btn>
        <div class="text-caption lc-mute">Последний бэкап: {{ lastBackupAt }}</div>
      </div>
    </LcSectionCard>

    <!-- Обратная связь (Фаза 14, задача 14.5): отчёт уходит разработчику вместе с
         диагностикой. Без сети он остаётся в локальной очереди и уезжает сам. -->
    <LcSectionCard title="поддержка" icon="support_agent">
      <div class="q-gutter-y-sm">
        <q-btn
          class="full-width"
          no-caps
          outline
          color="secondary"
          icon="bug_report"
          label="Сообщить об ошибке"
          @click="openFeedback"
        />
        <div class="text-caption lc-mute">
          К отчёту прикладывается диагностика: версия приложения, версия схемы, состояние
          синхронизации и последние ошибки. Заказы, клиенты и суммы не отправляются.
        </div>
        <div v-if="feedbackPending" class="text-caption lc-mute">
          В очереди: {{ feedbackPending }} — уедет при появлении сети.
        </div>
        <div v-else class="text-caption lc-mute">Очередь отчётов пуста.</div>
      </div>
    </LcSectionCard>

    <!-- Режим разработчика (задача 12.5; доработка): тумблер в настройках, панель
         (логи/диагностика/очередь) появляется под ним и подгружается лениво. -->
    <LcSectionCard title="разработка" icon="bug_report">
      <div class="row items-center no-wrap">
        <div class="col">
          <div class="lc-muted">Режим разработчика</div>
          <div class="text-caption lc-mute">
            Логи, диагностика и очередь синка. Выбор запоминается на устройстве.
          </div>
        </div>
        <q-toggle v-model="devMode" color="secondary" />
      </div>
    </LcSectionCard>

    <component :is="DeveloperPanel" v-if="devMode" />

    <LcSectionCard title="аккаунт" icon="person">
      <div class="q-gutter-y-sm">
        <div class="lc-muted">{{ auth.userName }}</div>
        <div class="text-caption lc-mute">
          {{ auth.hasPin ? 'Вход защищён PIN-кодом' : 'PIN-код не установлен' }}
        </div>
        <q-btn
          class="full-width"
          no-caps
          outline
          color="negative"
          icon="logout"
          label="Выйти"
          @click="signOut"
        />
      </div>
    </LcSectionCard>

    <!-- Восстановление из JSON-бэкапа (задача 11.9) — только на устройстве. -->
    <LcDialogShell
      :model-value="restoreOpen"
      title="Восстановить из бэкапа"
      subtitle="аварийный путь без сервера"
      confirm-label="Восстановить"
      confirm-color="deep-orange"
      :confirm-disable="!selectedBackup"
      :loading="restoreLoading"
      @update:model-value="restoreOpen = $event"
      @confirm="confirmRestore"
    >
      <div class="text-caption lc-mute">
        Данные берутся из файла, а не с сервера. Текущая локальная база будет
        <b>полностью заменена</b>. Для переноса на новое устройство пользуйтесь входом
        и синхронизацией.
      </div>

      <q-select
        v-model="selectedBackup"
        class="q-mt-md"
        :options="backupOptions"
        option-label="fileName"
        option-value="fileName"
        emit-value
        map-options
        dense
        outlined
        color="secondary"
        label="Файл бэкапа"
      />

      <div v-if="!backupOptions.length" class="text-caption lc-mute q-mt-sm">
        Бэкапов не найдено — сначала создайте бэкап.
      </div>
    </LcDialogShell>

    <!-- Диалог добавления специализации (задача 12.1/12.2): выбор ниши из доступных
         пресетов. Сама страница селектор больше не показывает. -->
    <LcDialogShell
      v-model="newProfileDialogOpen"
      title="Ещё одна специализация"
      subtitle="выберите нишу из доступных"
      confirm-label="Добавить"
      :confirm-disable="!newProfilePreset"
      :loading="busy"
      @confirm="addProfile"
    >
      <q-select
        v-model="newProfilePreset"
        :options="presetOptions"
        label="Специализация"
        outlined
        dense
        emit-value
        map-options
        color="secondary"
      />
      <div class="text-caption lc-mute q-mt-sm">
        Каталог, лексикон и разделы появятся сразу. Переименовать профиль или сменить
        его пресет позже нельзя — можно переключить активный или добавить ещё нишу.
      </div>
    </LcDialogShell>

    <!-- Диалог обновления (задача 13.13): версия, «что нового», прогресс, установка. -->
    <UpdateDialog v-model="updateDialogOpen" />

    <!-- Диалог «Сообщить об ошибке» (Фаза 14): форма + очередь последних отчётов. -->
    <FeedbackDialogPage ref="feedbackDialog" @changed="refreshFeedbackPending" />

    <DeleteConfirmPage ref="dangerConfirm" />
  </q-page>
</template>

<style scoped></style>
