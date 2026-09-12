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
// Общие UI-элементы и подтверждение разрушительных действий (переработка интерфейса).
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import LcPageHeader from 'src/components/ui/LcPageHeader.vue'
import LcSectionCard from 'src/components/ui/LcSectionCard.vue'

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

// Разрушительные действия подтверждаются: раньше кнопка «полный сброс» срабатывала сразу.
const fullReset = () => {
  dangerConfirm.value.open(
    'Полный сброс',
    'Локальная база будет очищена, данные перечитаются с сервера. Продолжить?',
    async () => {
      try {
        await SyncService.fullReset()
        logger.log('Полный сброс локальной базы выполнен.')
        await specializationsStore.load() // Перезагружаем данные в сторе (теперь они будут пустыми)
      } catch (error) {
        console.error('Ошибка при полном сбросе:', error)
        $q.notify({ type: 'negative', message: 'Не удалось выполнить сброс' })
      }
    }
  )
}

const deleteDB = () => {
  dangerConfirm.value.open(
    'Удалить локальную БД',
    'Локальные данные будут удалены без возможности восстановления. Уверены?',
    async () => {
      try {
        await SyncService.deleteLocalDB()
        $q.notify({
          type: 'positive',
          message: 'Локальная база данных удалена. Перезагрузите страницу.',
          timeout: 0, // не скрывать автоматически
          // noinspection JSUnusedGlobalSymbols
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
        console.error('Ошибка при удалении БД:', error)
        $q.notify({ type: 'negative', message: 'Не удалось удалить базу данных.' })
      }
    }
  )
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
  <q-page class="lc-page lc-shell">
    <LcPageHeader title="ещё" subtitle="профили, шаблоны, данные и аккаунт" icon="tune" />

    <!-- Рабочие профили (Фаза 10, задача 10.8): добавление, переименование, архивирование. -->
    <LcSectionCard title="рабочий профиль" icon="badge">
      <div class="q-gutter-y-sm">
        <q-input v-model="profileName" dense outlined color="secondary" label="Название профиля" />
        <q-btn
          size="sm"
          no-caps
          color="secondary"
          text-color="black"
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
          emit-value
          map-options
          color="secondary"
        />

        <q-separator dark class="q-my-sm" />

        <div class="lc-eyebrow">добавить профиль</div>
        <q-input
          v-model="newProfileName"
          dense
          outlined
          color="secondary"
          label="Название новой специализации"
        />
        <q-btn
          size="sm"
          no-caps
          outline
          color="secondary"
          label="Добавить"
          :disable="!newProfileName.trim()"
          @click="addProfile"
        />

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

    <!-- Шаблон специализации: стартовый каталог (10.4) + видимость разделов (10.3). -->
    <LcSectionCard title="шаблон специализации" icon="auto_awesome">
      <div class="q-gutter-y-sm">
        <q-select
          v-model="selectedPreset"
          :options="presetOptions"
          label="Шаблон"
          outlined
          dense
          emit-value
          map-options
          color="secondary"
        />
        <q-btn
          class="full-width"
          no-caps
          color="secondary"
          text-color="black"
          label="Применить шаблон"
          :loading="busy"
          :disable="!activeSpecialization || !selectedPreset"
          @click="applyPreset"
        />
        <div class="text-caption lc-mute">Повторное применение не создаёт дублей.</div>

        <q-separator dark class="q-my-sm" />

        <div class="lc-eyebrow">разделы профиля</div>
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
        <div class="text-caption lc-mute">Последний бэкап: {{ lastBackupAt }}</div>
      </div>
    </LcSectionCard>

    <!-- Опасная зона: действия подтверждаются (см. `fullReset`/`deleteDB`). -->
    <LcSectionCard title="опасная зона" icon="warning_amber">
      <div class="q-gutter-y-sm">
        <q-btn
          class="full-width"
          no-caps
          flat
          color="negative"
          icon="restart_alt"
          label="Полный сброс (для отладки)"
          @click="fullReset"
        />
        <q-btn
          class="full-width"
          no-caps
          flat
          color="deep-orange"
          icon="delete_forever"
          label="Удалить локальную БД"
          @click="deleteDB"
        />
      </div>
    </LcSectionCard>

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

    <DeleteConfirmPage ref="dangerConfirm" />
  </q-page>
</template>

<style scoped></style>
