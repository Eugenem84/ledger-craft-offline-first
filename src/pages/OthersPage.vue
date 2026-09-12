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
import { PRESETS } from 'src/domain/presets/index.js'
import { resolveFeatures, FEATURE_LABELS } from 'src/domain/features.js'
// Общие UI-элементы и подтверждение разрушительных действий (переработка интерфейса).
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import LcPageHeader from 'src/components/ui/LcPageHeader.vue'
import LcSectionCard from 'src/components/ui/LcSectionCard.vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

// Задача 12.5: «Режим разработчика» — только dev-сборка. Флаг и динамический
// импорт стоят под «точечным» `import.meta.env.DEV`: в проде Vite подставляет
// `false`, условие сворачивается, и чанк панели в бандл не попадает.
const DeveloperPanel =
  import.meta.env.DEV === true
    ? defineAsyncComponent(() => import('src/components/dev/DeveloperPanel.vue'))
    : null

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

// --- Управление рабочими профилями (Фаза 10, задача 10.8; Фаза 12, 12.1/12.2) ---
// Активный профиль переключается в шапке (`MainLayout.vue`). Здесь можно добавить
// **ещё одну** специализацию — только выбором из доступных ниш: у нового профиля
// сразу есть пресет (каталог/лексикон/флаги разделов), как при регистрации.
// Переименовать профиль или сменить его пресет нельзя (12.2). Архивируем, а не
// удаляем: у серверных `categories`/`product_categories` FK на `specializations`
// с `onDelete('cascade')`, физическое удаление снесло бы весь каталог.
const newProfilePreset = ref(null)
const busy = ref(false)

const activeSpecialization = computed(() => specializationsStore.getSelectedSpecialization)
const archivedItems = computed(() => specializationsStore.items.filter(item => item.archived))
const activeFeatures = computed(() => resolveFeatures(activeSpecialization.value))
const presetOptions = computed(() =>
  PRESETS.map(preset => ({ label: preset.label, value: preset.key, icon: preset.icon }))
)

const addProfile = async () => {
  if (!newProfilePreset.value) return

  busy.value = true
  try {
    await specializationsStore.createFromPreset(newProfilePreset.value)
    newProfilePreset.value = null
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
})

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

        <div class="lc-eyebrow">добавить ещё одну специализацию</div>
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
        <q-btn
          size="sm"
          no-caps
          outline
          color="secondary"
          label="Добавить ещё одну специализацию"
          :loading="busy"
          :disable="!newProfilePreset"
          @click="addProfile"
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

    <!-- Разделы профиля — только просмотр (10.3): пресет задаётся при создании профиля. -->
    <LcSectionCard title="разделы профиля" icon="visibility">
      <div class="q-gutter-y-sm">
        <div
          v-for="(label, flag) in FEATURE_LABELS"
          :key="flag"
          class="row items-center no-wrap text-caption"
        >
          <q-icon
            :name="activeFeatures[flag] ? 'check_circle' : 'visibility_off'"
            size="16px"
            :color="activeFeatures[flag] ? 'positive' : 'grey-6'"
            class="q-mr-sm"
          />
          <span class="lc-muted">{{ label }}</span>
          <q-space />
          <span class="lc-mute">{{ activeFeatures[flag] ? 'включено' : 'скрыто' }}</span>
        </div>
      </div>
    </LcSectionCard>

    <!-- Синхронизация и бэкап: индикатор состояния живёт внизу экрана. -->
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

    <!-- Режим разработчика (задача 12.5): только dev-сборка. `DeveloperPanel`
         равен `null` в проде, поэтому секции там нет вовсе. -->
    <component :is="DeveloperPanel" v-if="DeveloperPanel" />

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

    <DeleteConfirmPage ref="dangerConfirm" />
  </q-page>
</template>

<style scoped></style>
