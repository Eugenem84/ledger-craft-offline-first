<script setup>
// src/components/settings/SettingsDialog.vue
//
// Настройки приложения — модальное окно поверх каркаса (правка владельца 17.09.2026).
//
// Что изменилось по сравнению с прежней страницей «ещё»:
//   • **это диалог, а не раздел**: в таббаре больше нет вкладки «ещё» — вместо неё узкая
//     кнопка-шестерёнка (`MainLayout.vue`), поэтому на настройки нельзя ни попасть свайпом,
//     ни промахнуться пальцем по широкой вкладке (жалоба владельца: «сделать уже кнопку,
//     чтоб случайно не тыкать»);
//   • **окно большое** (≈90 % экрана) и с кнопками «Сохранить»/«Отмена»: всё, что относится
//     к настройкам (профиль, разделы, отчёт, режим разработчика), живёт в **черновиках** и
//     пишется только по «Сохранить» — «Отмена» закрывает окно без следов;
//   • **разделы разложены по вкладкам**: специализация, разделы профиля, отчёты, обновление,
//     данные и синхронизация, поддержка, аккаунт, разработка (раньше — одна длинная простыня).
//
// Исключение из «черновиков» — действия, а не настройки: добавить/архивировать/вернуть
// профиль, синхронизировать, сделать бэкап, восстановиться из бэкапа, проверить обновление,
// применить OTA-бандл, отправить отчёт об ошибке, выйти из аккаунта. Они делают работу сразу
// (и показывают своё уведомление), иначе «Сохранить» пришлось бы нажимать после каждой.
//
// Панели `q-tab-panel` объявлены здесь и лежат **прямыми детьми** `q-tab-panels` — иначе
// Quasar не отрисует содержимое вкладок (ловушка описана в `docs/UI.md` §4). Содержимое
// вкладки «отчёты» живёт в отдельном компоненте с обычным корнем `<div>`.
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'

import SyncService from 'src/services/syncService.js'
import { createBackup, getLastBackupAt, listBackups, restoreBackup } from 'src/services/backupService.js'
import feedbackService from 'src/services/feedbackService.js'
import { isNativePlatform } from 'src/utils/platform.js'
import { logger } from 'src/utils/logger.js'
import { devModeEnabled, setDevMode } from 'src/utils/devMode.js'
import {
  getReportContent,
  getReportFormat,
  setReportContent,
  setReportFormat,
} from 'src/utils/reportSettings.js'
import { FEATURE_HINTS, FEATURE_LABELS, resolveFeatures } from 'src/domain/features.js'
import { PRESETS } from 'src/domain/presets/index.js'
import { parseReleaseNotes } from 'src/utils/releaseNotes.js'
import { useAuthStore } from 'src/stores/useAuthStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'

import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import FeedbackDialogPage from 'pages/dialogs/FeedbackDialogPage.vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import LcSectionCard from 'src/components/ui/LcSectionCard.vue'
import UpdateDialog from 'src/components/UpdateDialog.vue'
import ReportSettingsPanel from 'src/components/settings/ReportSettingsPanel.vue'

// «Режим разработчика» (задача 12.5): панель доступна всегда, но подгружается лениво —
// в обычной работе её чанк не грузится. Нужна и на боевом APK: там нет консоли, а логи
// и состояние БД иногда надо снять.
const DeveloperPanel = defineAsyncComponent(() => import('src/components/dev/DeveloperPanel.vue'))

/** Вкладки окна настроек — порядок такой же, как в `q-tabs`. */
const SETTINGS_TABS = [
  { name: 'specialization', label: 'специализация', icon: 'badge' },
  { name: 'sections', label: 'разделы профиля', icon: 'tune' },
  { name: 'reports', label: 'отчеты', icon: 'share' },
  { name: 'updates', label: 'обновление', icon: 'system_update' },
  { name: 'data', label: 'данные и синхронизация', icon: 'cloud_sync' },
  { name: 'support', label: 'поддержка', icon: 'support_agent' },
  { name: 'account', label: 'аккаунт', icon: 'person' },
  { name: 'dev', label: 'разработка', icon: 'bug_report' },
]

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** С какой вкладки открыть окно (шапка открывает «специализацию»). */
  initialTab: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const $q = useQuasar()
const router = useRouter()
const store = useSpecializationsStore()
const update = useUpdateStore()
const auth = useAuthStore()

const tab = ref(SETTINGS_TABS[0].name)
const saving = ref(false)

/** Короткие уведомления внизу: сверху они спорят с шапкой (правка владельца 17.09.2026). */
const notify = (type, message) => $q.notify({ type, message, position: 'bottom', timeout: 2200 })

// --- Черновики настроек -------------------------------------------------------
// Ничего из этого не пишется, пока не нажато «Сохранить»: именно ради этого окно и
// получило кнопку «Отмена» (закрытие крестиком и «Отменой» — одно и то же).
const draftProfileId = ref(null)
const draftFeatures = ref({ ...resolveFeatures(null) })
const draftReportFormat = ref(getReportFormat())
const draftReportContent = ref(getReportContent())
const draftDevMode = ref(devModeEnabled.value)

const profileById = id => store.items.find(item => item.id === id) || null
const activeSpecialization = computed(
  () => profileById(draftProfileId.value) || store.getSelectedSpecialization
)
const archivedItems = computed(() => store.items.filter(item => item.archived))
const profileOptions = computed(() =>
  store.activeItems.map(item => ({ value: item.id, label: item.name }))
)

/** Разделы профиля: тумблеры пишут черновик, в БД уходит по «Сохранить». */
const setDraftFeature = (flag, value) => {
  draftFeatures.value = { ...draftFeatures.value, [flag]: value === true }
}

const FEATURE_FLAGS = Object.keys(FEATURE_LABELS)
const sameFeatures = (left, right) =>
  FEATURE_FLAGS.every(flag => Boolean(left?.[flag]) === Boolean(right?.[flag]))

/** Смена профиля в черновике подтягивает его разделы: у каждого профиля свои флаги. */
watch(draftProfileId, id => {
  draftFeatures.value = { ...resolveFeatures(profileById(id)) }
})

/**
 * Режим разработчика может выключить сама панель (у неё своя кнопка) — тогда черновик
 * не должен показывать «включено»: подтягиваем внешнее значение.
 */
watch(devModeEnabled, value => {
  if (!value) draftDevMode.value = false
})

// --- Открытие окна ------------------------------------------------------------

const resetDrafts = () => {
  draftProfileId.value = store.selectedId
  draftFeatures.value = { ...resolveFeatures(store.getSelectedSpecialization) }
  draftReportFormat.value = getReportFormat()
  draftReportContent.value = getReportContent()
  draftDevMode.value = devModeEnabled.value

  newProfilePreset.value = null
  newProfileDialogOpen.value = false
  restoreOpen.value = false
}

/** Второстепенные данные окна: список профилей, дата бэкапа, очередь отчётов. */
async function refreshSecondary() {
  try {
    await store.load()
  } catch (error) {
    logger.warn('[Settings] Не удалось перечитать профили:', error?.message)
  }

  try {
    lastBackupAtValue.value = await getLastBackupAt()
  } catch (error) {
    logger.warn('[Settings] Не удалось прочитать дату бэкапа:', error?.message)
  }

  await refreshFeedbackPending()
}

const close = () => emit('update:modelValue', false)

/** «Отмена» и крестик: черновики просто выбрасываются. */
const cancel = () => close()

// --- Сохранение ---------------------------------------------------------------

const save = async () => {
  saving.value = true

  try {
    const target = profileById(draftProfileId.value)
    const profileChanged = Boolean(target && target.id !== store.selectedId)

    if (profileChanged) await store.select(target.id)

    // Пишем разделы, только если они реально изменились: `setFeatures` — это ещё и
    // операция в очереди синка, лишние записи «на всякий случай» там не нужны.
    if (target && !sameFeatures(draftFeatures.value, resolveFeatures(target))) {
      await store.setFeatures(target.id, draftFeatures.value)
    }

    setReportFormat(draftReportFormat.value)
    setReportContent(draftReportContent.value)
    setDevMode(draftDevMode.value)

    notify('positive', 'Настройки сохранены')
    close()
    emit('saved', { profileChanged })
  } catch (error) {
    logger.error('[Settings] Не удалось сохранить настройки:', error)
    notify('negative', 'Не удалось сохранить настройки')
  } finally {
    saving.value = false
  }
}

// --- Обновление приложения (Фазы 13/15) ---------------------------------------

const updateDialogOpen = ref(false)
const updateChecking = ref(false)
const releaseNotes = computed(() => parseReleaseNotes(update.releaseNotes))

const checkUpdates = async () => {
  updateChecking.value = true

  try {
    await update.checkNow()
    notify(
      update.status.available || update.status.bundleAvailable ? 'info' : 'positive',
      update.statusText
    )
  } catch (error) {
    logger.error('[Settings] Не удалось проверить обновления:', error)
    notify('negative', 'Не удалось проверить обновления')
  } finally {
    updateChecking.value = false
  }
}

/**
 * OTA веб-слоя (Фаза 15): обновление без установки. Бандл уже скачан — сразу
 * перезапускаемся; иначе открываем диалог (версия, размер, «что нового»).
 */
const startOtaUpdate = async () => {
  if (update.bundleReady) {
    await update.restartNow()

    return
  }

  updateDialogOpen.value = true
}

// --- Данные и синхронизация ---------------------------------------------------

const sync = async () => {
  try {
    // Ручной повтор (задачи 6.2/3.7): `force` игнорирует паузу после сбоя, чтобы кнопка
    // не казалась «мёртвой» в течение backoff.
    await SyncService.sync({ force: true })
    logger.log('Синхронизация завершена успешно.')
    await store.load()
    notify('positive', 'Синхронизация завершена')
  } catch (error) {
    logger.error('[Settings] Ошибка при синхронизации:', error)
    notify('negative', 'Не удалось синхронизировать')
  }
}

const backupLoading = ref(false)
const lastBackupAtValue = ref(null)
const lastBackupAt = computed(() =>
  lastBackupAtValue.value ? new Date(lastBackupAtValue.value).toLocaleString() : 'ещё не делался'
)

const makeBackup = async () => {
  backupLoading.value = true

  try {
    const backup = await createBackup()
    lastBackupAtValue.value = backup.createdAt
    notify('positive', `Бэкап создан: ${backup.fileName}`)
  } catch (error) {
    logger.error('[Settings] Ошибка при создании бэкапа:', error)
    notify('negative', `Не удалось создать бэкап: ${error.message}`)
  } finally {
    backupLoading.value = false
  }
}

// Восстановление из бэкапа (задача 11.9) — АВАРИЙНЫЙ путь без сервера: обычный перенос на
// новое устройство — это вход и синхронизация. Доступно только на устройстве: там бэкап
// JSON, в браузере — дамп `.sqlite` (только выгрузка), поэтому восстановления для него нет.
const dangerConfirm = ref(null)
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
    logger.error('[Settings] Ошибка чтения списка бэкапов:', error)
    notify('negative', `Не удалось прочитать бэкапы: ${error.message}`)
  } finally {
    restoreLoading.value = false
  }
}

const confirmRestore = () => {
  const target = backupOptions.value.find(item => item.fileName === selectedBackup.value)
  if (!target) return

  restoreOpen.value = false

  // Разрушительное действие (замена всей БД) — подтверждаем отдельным диалогом.
  dangerConfirm.value?.open(
    'Восстановить из бэкапа',
    'Текущая локальная база будет ПОЛНОСТЬЮ заменена данными из файла. Это аварийный путь без ' +
      'сервера — обычный перенос делается входом и синхронизацией. Продолжить?',
    async () => {
      restoreLoading.value = true
      // Синк на время замены БД останавливаем: он держит соединение и очередь операций.
      SyncService.stopAutoSync()

      try {
        const result = await restoreBackup({
          fileName: target.fileName,
          directory: target.directory,
        })
        notify('positive', `Данные восстановлены из ${result.fileName}. Перезапустите приложение.`)
      } catch (error) {
        logger.error('[Settings] Ошибка восстановления из бэкапа:', error)
        SyncService.startAutoSync()
        notify('negative', `Не удалось восстановить: ${error.message}`)
      } finally {
        restoreLoading.value = false
      }
    }
  )
}

// --- Поддержка (Фаза 14) ------------------------------------------------------

const feedbackDialog = ref(null)
const feedbackPending = ref(0)

async function refreshFeedbackPending() {
  try {
    feedbackPending.value = await feedbackService.pendingCount()
  } catch (error) {
    // Счётчик — не повод ломать настройки: показываем ноль и пишем в лог.
    logger.warn('[Feedback] Не удалось прочитать очередь отчётов:', error?.message)
    feedbackPending.value = 0
  }
}

const openFeedback = () => feedbackDialog.value?.open()

// --- Профили: действия (применяются сразу, это не «настройка») ----------------

const newProfilePreset = ref(null)
const newProfileDialogOpen = ref(false)
const busy = ref(false)
const presetOptions = computed(() =>
  PRESETS.map(preset => ({ label: preset.label, value: preset.key, icon: preset.icon }))
)

const openNewProfileDialog = () => {
  newProfilePreset.value = null
  newProfileDialogOpen.value = true
}

/**
 * Добавление профиля: только выбор из доступных ниш (задачи 12.1/12.2) — у нового профиля
 * сразу есть пресет (каталог, лексикон, флаги разделов), как при регистрации. Переименовать
 * профиль или сменить ему пресет нельзя: можно переключить активный или добавить нишу.
 */
const addProfile = async () => {
  if (!newProfilePreset.value) return

  busy.value = true
  try {
    await store.createFromPreset(newProfilePreset.value)
    newProfileDialogOpen.value = false
    // Новый профиль сразу становится активным — черновик подтягивает его разделы.
    draftProfileId.value = store.selectedId
    notify('positive', 'Специализация добавлена')
  } catch (error) {
    logger.error('[Settings] Ошибка добавления специализации:', error)
    notify('negative', 'Не удалось добавить специализацию')
  } finally {
    busy.value = false
  }
}

/**
 * Архивируем, а не удаляем: у серверных `categories`/`product_categories` есть FK на
 * `specializations` с `onDelete('cascade')` — физическое удаление снесло бы весь каталог.
 */
const archiveProfile = async () => {
  const specialization = activeSpecialization.value
  if (!specialization) return

  try {
    await store.archive(specialization.id)
    draftProfileId.value = store.selectedId
    notify('positive', 'Профиль в архиве — его история сохранена')
  } catch (error) {
    logger.error('[Settings] Не удалось архивировать профиль:', error)
    notify('negative', 'Не удалось архивировать профиль')
  }
}

const restoreProfile = async id => {
  try {
    await store.unarchive(id)
    notify('positive', 'Профиль возвращён')
  } catch (error) {
    logger.error('[Settings] Не удалось вернуть профиль:', error)
    notify('negative', 'Не удалось вернуть профиль')
  }
}

// --- Аккаунт ------------------------------------------------------------------

const signOut = async () => {
  await auth.logout()
  close()
  await router.replace('/login')
}

// --- Открытие окна ------------------------------------------------------------
//
// Подписка на `modelValue` стоит **в конце setup** и с `immediate: true`: колбэк умеет
// открыть окно сразу при монтировании (если родитель отрисовал его уже открытым), а ему
// нужны `drafts`, `lastBackupAtValue` и `refreshFeedbackPending` — все они объявлены выше.
// Без `immediate` окно, смонтированное открытым, показало бы пустые черновики.
watch(
  () => props.modelValue,
  async value => {
    if (!value) return

    tab.value = SETTINGS_TABS.some(item => item.name === props.initialTab)
      ? props.initialTab
      : SETTINGS_TABS[0].name

    resetDrafts()
    await refreshSecondary()
  },
  { immediate: true }
)
</script>

<template>
  <!--
    Корень — обычный `<div>`: каркас монтирует это окно один раз поверх страниц, а внутри
    живёт `q-dialog` (Quasar рендерит его на месте, поэтому окно не зависит от страницы) и
    дочерние диалоги: выбор ниши при добавлении профиля, восстановление из бэкапа,
    обновление, отчёт об ошибке и подтверждение разрушительных действий.
  -->
  <div class="lc-settings-root">
    <q-dialog
      :model-value="props.modelValue"
      persistent
      @update:model-value="value => emit('update:modelValue', value)"
    >
      <q-card class="lc-settings">
        <q-card-section class="row items-start no-wrap">
          <q-icon name="settings" size="20px" class="lc-mute q-mr-sm q-mt-xs" />
          <div class="col">
            <div class="text-subtitle1">настройки</div>
            <div class="text-caption lc-mute">
              Изменения применяются кнопкой «Сохранить», «Отмена» их отбрасывает
            </div>
          </div>
          <q-btn
            flat
            round
            dense
            icon="close"
            color="grey-6"
            aria-label="закрыть настройки"
            @click="cancel"
          />
        </q-card-section>

        <q-separator dark />

        <!-- Вкладки настроек. Лентой со стрелками: на телефоне восемь подписей целиком не
             влезают, а подписи владелец просил именно такие. -->
        <q-tabs
          v-model="tab"
          class="lc-settings__tabs"
          dense
          no-caps
          align="left"
          mobile-arrows
          outside-arrows
          active-color="secondary"
          indicator-color="secondary"
        >
          <q-tab
            v-for="item in SETTINGS_TABS"
            :key="item.name"
            :name="item.name"
            :icon="item.icon"
            :label="item.label"
          >
            <q-tooltip class="text-caption">{{ item.label }}</q-tooltip>
          </q-tab>
        </q-tabs>

        <q-separator dark />

        <!-- Панели — прямые дети `q-tab-panels` (ловушка Quasar, см. docs/UI.md §4). -->
        <q-tab-panels v-model="tab" class="lc-settings__body" animated>
          <!-- 1. Специализация: активный профиль, добавление ниши, архив. -->
          <q-tab-panel name="specialization" class="q-pa-md">
            <LcSectionCard title="рабочий профиль" icon="badge">
              <div class="q-gutter-y-sm">
                <q-select
                  v-model="draftProfileId"
                  :loading="store.loading"
                  :options="profileOptions"
                  label="Переключить профиль"
                  outlined
                  dense
                  emit-value
                  map-options
                  color="secondary"
                />
                <div class="text-caption lc-mute">
                  Профиль сменится по кнопке «Сохранить» — разделы ниже тоже.
                </div>

                <q-separator dark class="q-my-sm" />

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
          </q-tab-panel>

          <!-- 2. Разделы профиля: тумблеры пишут черновик, в БД уходят по «Сохранить». -->
          <q-tab-panel name="sections" class="q-pa-md">
            <LcSectionCard title="разделы профиля" icon="tune">
              <div class="q-gutter-y-sm">
                <div class="text-caption lc-mute">
                  Включите разделы, которые нужны этой специализации. Применяется по кнопке
                  «Сохранить» и синхронизируется с сервером.
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
                    :model-value="draftFeatures[flag] !== false"
                    color="secondary"
                    :disable="!activeSpecialization"
                    @update:model-value="value => setDraftFeature(flag, value)"
                  />
                </div>

                <div v-if="!activeSpecialization" class="text-caption lc-mute">
                  Нет активного профиля — сначала добавьте специализацию.
                </div>
              </div>
            </LcSectionCard>
          </q-tab-panel>

          <!-- 3. Отчёты: формат (ссылка / текст) и состав с живым образцом. -->
          <q-tab-panel name="reports" class="q-pa-md">
            <ReportSettingsPanel
              v-model:format="draftReportFormat"
              v-model:content="draftReportContent"
            />
          </q-tab-panel>

          <!-- 4. Обновление: своя версия, проверка, APK и OTA веб-слоя. -->
          <q-tab-panel name="updates" class="q-pa-md">
            <LcSectionCard title="обновление приложения" icon="system_update">
              <div class="q-gutter-y-sm">
                <div class="row items-center no-wrap">
                  <div class="col">
                    <div class="lc-muted">Версия {{ update.currentLabel }}</div>
                    <div v-if="update.currentBundleId" class="text-caption lc-mute">
                      обновление веб-слоя: {{ update.currentBundleId }}
                    </div>
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

                <!-- OTA веб-слоя (Фаза 15): без установки — бандл применяется при запуске. -->
                <q-btn
                  v-if="update.canApplyBundle || update.bundleReady"
                  class="full-width"
                  no-caps
                  :outline="!update.bundleReady"
                  :unelevated="update.bundleReady"
                  :color="update.bundleReady ? 'positive' : 'secondary'"
                  :text-color="update.bundleReady ? 'black' : undefined"
                  :icon="update.bundleReady ? 'restart_alt' : 'cloud_download'"
                  :label="
                    update.bundleReady
                      ? 'Перезапустить и применить'
                      : `Обновить без установки (${update.bundleVersion})`
                  "
                  :loading="update.applyingBundle"
                  @click="startOtaUpdate"
                />

                <div class="text-caption lc-mute">
                  Обновления без установки приходят с сервера мастерской: правки интерфейса и
                  логики применяются сами, данные и настройки сохраняются. Установка APK нужна
                  только когда меняется нативная часть приложения.
                </div>
              </div>
            </LcSectionCard>
          </q-tab-panel>

          <!-- 5. Данные и синхронизация: ручной синк, бэкап, аварийное восстановление. -->
          <q-tab-panel name="data" class="q-pa-md">
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
                <div class="text-caption lc-mute">
                  Индикатор синхронизации живёт в шапке: цвет и значок показывают сеть, вход и
                  очередь неотправленного.
                </div>
              </div>
            </LcSectionCard>
          </q-tab-panel>

          <!-- 6. Поддержка: «Сообщить об ошибке» и очередь отчётов. -->
          <q-tab-panel name="support" class="q-pa-md">
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
          </q-tab-panel>

          <!-- 7. Аккаунт: под кем работаем, защита PIN и выход. -->
          <q-tab-panel name="account" class="q-pa-md">
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
                <div class="text-caption lc-mute">
                  Локальные данные останутся на устройстве: после выхода их можно выгрузить и
                  синхронизировать под другим аккаунтом.
                </div>
              </div>
            </LcSectionCard>
          </q-tab-panel>

          <!-- 8. Разработка: тумблер режима разработчика и ленивая панель диагностики. -->
          <q-tab-panel name="dev" class="q-pa-md">
            <LcSectionCard title="разработка" icon="bug_report">
              <div class="row items-center no-wrap">
                <div class="col">
                  <div class="lc-muted">Режим разработчика</div>
                  <div class="text-caption lc-mute">
                    Логи, диагностика и очередь синка. Выбор запоминается на устройстве по кнопке
                    «Сохранить» и работает даже в боевой сборке.
                  </div>
                </div>
                <q-toggle v-model="draftDevMode" color="secondary" />
              </div>
            </LcSectionCard>

            <component :is="DeveloperPanel" v-if="draftDevMode" />
          </q-tab-panel>
        </q-tab-panels>

        <q-separator dark />

        <!-- Кнопки окна: «Отмена» выбрасывает черновики, «Сохранить» пишет их. -->
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps color="grey-5" label="Отмена" @click="cancel" />
          <q-btn
            unelevated
            no-caps
            color="secondary"
            text-color="black"
            icon="check"
            label="Сохранить"
            :loading="saving"
            @click="save"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Добавление специализации (задачи 12.1/12.2): только выбор ниши из доступных. -->
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
        Каталог, лексикон и разделы появятся сразу. Переименовать профиль или сменить его пресет
        позже нельзя — можно переключить активный или добавить ещё нишу.
      </div>
    </LcDialogShell>

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
        <b>полностью заменена</b>. Для переноса на новое устройство пользуйтесь входом и
        синхронизацией.
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

    <!-- Обновление (задача 13.13): версия, «что нового», прогресс, установка. -->
    <UpdateDialog v-model="updateDialogOpen" />

    <!-- «Сообщить об ошибке» (Фаза 14): форма и очередь последних отчётов. -->
    <FeedbackDialogPage ref="feedbackDialog" @changed="refreshFeedbackPending" />

    <DeleteConfirmPage ref="dangerConfirm" />
  </div>
</template>

<style scoped>
/*
 * Окно «на 90 % экрана» (правка владельца 17.09.2026: «модальным окном на 90% экрана или
 * типа того»). Края экрана остаются видны — заметно, что под окном приложение, и закрыть
 * его всегда очевидно. `dvh` — то же значение, но с учётом динамических панелей
 * браузера/Android; `vh` оставлен фолбэком для старых WebView.
 */
.lc-settings {
  width: 92vw;
  max-width: 820px;
  height: 90vh;
  height: 90dvh;
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
}

/* Шапка, лента вкладок и кнопки не сжимаются: прокручивается только содержимое вкладки. */
.lc-settings > .q-card__section,
.lc-settings > .q-tabs,
.lc-settings > .q-card__actions {
  flex: 0 0 auto;
}

/* Тело окна — flex-контейнер: единственная отрисованная панель занимает всю высоту, а
   прокручивается она сама (заголовок и кнопки «Сохранить»/«Отмена» остаются на месте). */
.lc-settings__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

/* `:deep` — панели рендерит Quasar, своего scope-атрибута у них нет. */
.lc-settings__body :deep(.q-tab-panel) {
  width: 100%;
  overflow-y: auto;
}

/* Восемь вкладок: подписи мелкие, как в таббаре, чтобы в ленту влезало больше разделов,
   а до дальних помогают доехать стрелки (`mobile-arrows` + `outside-arrows`). */
.lc-settings__tabs .q-tab {
  min-height: 46px;
  padding: 4px 10px;
}

.lc-settings__tabs .q-tab__label {
  font-size: 11px;
  letter-spacing: 0.02em;
}

.lc-settings__tabs .q-icon {
  font-size: 18px;
}

@media (max-width: 599px) {
  .lc-settings {
    width: 96vw;
    height: 92vh;
    height: 92dvh;
    max-height: 92dvh;
  }
}
</style>

