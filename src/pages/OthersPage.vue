<script setup>
import { logger } from 'src/utils/logger'

import { computed, onMounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import SyncService from '../services/syncService.js'
import { createBackup, getLastBackupAt } from 'src/services/backupService.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { PRESETS } from 'src/domain/presets/index.js'
import { resolveFeatures, FEATURE_LABELS } from 'src/domain/features.js'

const $q = useQuasar()
const router = useRouter()

// Аккаунт (задача 7.4): видно, под кем работаем, и можно выйти.
const auth = useAuthStore()

const signOut = async () => {
  await auth.logout()
  await router.replace('/login')
}

// 1. Получаем экземпляр хранилища
const specializationsStore = useSpecializationsStore()

// --- Управление рабочими профилями (Фаза 10, задача 10.8) --------------------
// Активный профиль переключается в шапке (`MainLayout.vue`); здесь — добавление,
// переименование и архивирование. Архивируем, а не удаляем: у серверных
// `categories`/`product_categories` FK на `specializations` с `onDelete('cascade')`,
// физическое удаление снесло бы весь каталог и осиротило заказы.
const newProfileName = ref('')
const profileName = ref('')
const selectedPreset = ref(null)
const busy = ref(false)

const activeSpecialization = computed(() => specializationsStore.getSelectedSpecialization)
const archivedItems = computed(() => specializationsStore.items.filter(item => item.archived))
const activeFeatures = computed(() => resolveFeatures(activeSpecialization.value))
const presetOptions = computed(() =>
  PRESETS.map(preset => ({ label: preset.label, value: preset.key, icon: preset.icon }))
)

watch(activeSpecialization, value => {
  profileName.value = value?.name || ''
})

const addProfile = async () => {
  const name = newProfileName.value.trim()
  if (!name) return

  await specializationsStore.add({ name })
  newProfileName.value = ''
  $q.notify({ type: 'positive', message: 'Профиль добавлен', position: 'top', timeout: 1000 })
}

const renameProfile = async () => {
  const name = profileName.value.trim()
  if (!activeSpecialization.value || !name) return

  await specializationsStore.update(activeSpecialization.value.id, { name })
  $q.notify({ type: 'positive', message: 'Профиль переименован', position: 'top', timeout: 1000 })
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

// Применение пресета к активному профилю (задача 10.4): идемпотентно.
const applyPreset = async () => {
  if (!activeSpecialization.value || !selectedPreset.value) return

  busy.value = true
  try {
    const result = await specializationsStore.applyPreset(
      activeSpecialization.value.id,
      selectedPreset.value
    )
    $q.notify({
      type: 'positive',
      message: `Шаблон применён: категорий ${result.created.categories}, работ ${result.created.services}, товарных категорий ${result.created.productCategories}, моделей ${result.created.models}`,
      position: 'top',
      timeout: 3000,
    })
  } catch (error) {
    console.error('Ошибка применения шаблона:', error)
    $q.notify({ type: 'negative', message: 'Не удалось применить шаблон' })
  } finally {
    busy.value = false
  }
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

const fullReset = async () => {
  try {
    await SyncService.fullReset()
    logger.log('Полный сброс локальной базы выполнен.')
    await specializationsStore.load() // Перезагружаем данные в сторе (теперь они будут пустыми)
  } catch (error) {
    console.error('Ошибка при полном сбросе:', error)
  }
}

const deleteDB = async () => {
  try {
    await SyncService.deleteLocalDB()
    $q.notify({
      type: 'positive',
      message: 'Локальная база данных удалена. Перезагрузите страницу.',
      timeout: 0, // не скрывать автоматически
      // noinspection JSUnusedGlobalSymbols
      actions: [{ label: 'Перезагрузить', color: 'white', handler: () => { window.location.reload() } }],
    })
  } catch (error) {
    console.error('Ошибка при удалении БД:', error)
    $q.notify({ type: 'negative', message: 'Не удалось удалить базу данных.' })
  }
}

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

</script>

<template>
  <q-page padding class="bg-dark text-white">
    <div class="q-gutter-y-md" style="max-width: 400px">
      <!-- Рабочие профили (Фаза 10, задача 10.8): раньше здесь был один селект. -->
      <div class="text-subtitle2">Рабочий профиль</div>
      <q-input v-model="profileName" dense outlined dark label="Название профиля" />

      <q-btn
        size="sm"
        color="primary"
        label="Сохранить название"
        :disable="!activeSpecialization"
        @click="renameProfile"
      />

      <q-select
        v-model="selectedSpecialization"
        :loading="specializationsStore.loading"
        :options="specializationOptions"
        label="Переключить профиль"
        outlined
        dense
        dark
        color="white"
        label-color="white"
        emit-value
        map-options
      />

      <div class="text-subtitle2 q-mt-md">Начать с шаблона</div>
      <q-select
        v-model="selectedPreset"
        :options="presetOptions"
        label="Пресет специализации"
        outlined
        dense
        dark
        emit-value
        map-options
      />

      <q-btn
        color="primary"
        label="Применить шаблон"
        :loading="busy"
        :disable="!activeSpecialization || !selectedPreset"
        @click="applyPreset"
      />
      <div class="text-caption">Повторное применение не создаёт дублей.</div>

      <div class="text-subtitle2 q-mt-md">Возможности профиля</div>
      <div class="text-caption">
        <div v-for="(label, flag) in FEATURE_LABELS" :key="flag">
          {{ label }}: {{ activeFeatures[flag] ? 'включено' : 'скрыто' }}
        </div>
      </div>

      <q-separator dark class="q-my-md" />

      <div class="text-subtitle2">Добавить профиль</div>
      <q-input
        v-model="newProfileName"
        dense
        outlined
        dark
        label="Название новой специализации"
      />
      <q-btn
        color="primary"
        label="Добавить"
        :disable="!newProfileName.trim()"
        @click="addProfile"
      />

      <q-btn
        class="q-mt-sm"
        color="warning"
        label="Архивировать профиль"
        :disable="!activeSpecialization"
        @click="archiveProfile"
      />

      <template v-if="archivedItems.length">
        <div class="text-caption q-mt-sm">Архив (история сохранена)</div>
        <q-list dark dense>
          <q-item v-for="item in archivedItems" :key="item.id">
            <q-item-section>{{ item.name }}</q-item-section>
            <q-item-section side>
              <q-btn flat dense color="primary" label="вернуть" @click="restoreProfile(item.id)" />
            </q-item-section>
          </q-item>
        </q-list>
      </template>

      <q-separator dark class="q-my-md" />

      <q-btn
        label="Синхронизировать"
        color="primary"
        @click="sync"
      />

      <q-btn
        label="Создать бэкап"
        color="primary"
        :loading="backupLoading"
        @click="makeBackup"
      >
        <q-tooltip>Копия локальной базы: на Android — файл в документах, в браузере — скачивание</q-tooltip>
      </q-btn>
      <div class="text-caption">Последний бэкап: {{ lastBackupAt }}</div>

      <q-btn
        label="Полный сброс (для отладки)"
        color="negative"
        @click="fullReset"
      />

      <q-btn
        label="Удалить локальную БД"
        color="deep-orange"
        @click="deleteDB"
      />

      <q-separator dark class="q-my-md" />

      <div class="text-subtitle2">Аккаунт: {{ auth.userName }}</div>
      <div class="text-caption">
        {{ auth.hasPin ? 'Вход защищён PIN-кодом' : 'PIN-код не установлен' }}
      </div>
      <q-btn
        label="Выйти"
        color="negative"
        outline
        @click="signOut"
      />
    </div>
  </q-page>
</template>

<style scoped></style>
