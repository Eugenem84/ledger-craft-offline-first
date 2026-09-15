<script setup>
// src/layouts/MainLayout.vue
//
// Каркас приложения: шапка с активным рабочим профилем (Фаза 10, задачи 10.2/10.8)
// и нижняя навигация, состав которой зависит от пресета (задача 10.3).
//
// Что изменилось при переработке UI (концепция и цвета сохранены):
//   • вкладки строятся массивом (`v-for` + `class="col"`), а не вручную
//     подобранными `col-3 / col-2 / col-3`: при скрытии разделов флагами
//     пресета сетка больше не «разъезжается»;
//   • жёлтый — интерактивный акцент (`secondary`); акцент профиля по-прежнему
//     живёт в `primary` (runtime `setCssVar`) и виден в бейдже профиля;
//   • `view="lHh Lpr lFf"` (в исходнике был лишний пробел в конце);
//   • таббар получил safe-area для Android (`env(safe-area-inset-bottom)`).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { setCssVar } from 'quasar'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { useFeatures } from 'src/domain/features.js'
import { useLexicon } from 'src/domain/lexicon.js'
import { resolveAccent } from 'src/domain/theme.js'
import { getPreset } from 'src/domain/presets/index.js'
import { refreshTemplates } from 'src/services/presetService.js'
import SyncStatusBar from 'src/components/SyncStatusBar.vue'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'

const store = useSpecializationsStore()
const router = useRouter()
const route = useRoute()
const { isEnabled } = useFeatures()
const { t } = useLexicon()
const updateStore = useUpdateStore()

/**
 * Версия приложения в шапке (правка владельца 15.09.2026): мелко и серым, чтобы
 * «на глаз» понимать, какая сборка стоит на телефоне. Пока версия неизвестна
 * (веб-сборка без нативной части, первый запуск) — пусто: сам текст версии собирает
 * `useUpdateStore.currentVersionShort`, шапка только показывает.
 */
const appVersion = computed(() => updateStore.currentVersionShort)

/** Активная вкладка = текущий путь (подсветку ведёт `q-route-tab`). */
const tab = ref(route.path)

watch(
  () => route.path,
  path => {
    tab.value = path
  }
)

/** Профили для переключателя (архивированные скрыты). */
const profileOptions = computed(() =>
  store.activeItems.map(item => ({
    value: item.id,
    label: item.name,
    icon: getPreset(item.preset_key)?.icon || 'person',
  }))
)

const activeSpecialization = computed(() => store.getSelectedSpecialization)
const activeIcon = computed(
  () => store.activePreset?.icon || (activeSpecialization.value ? 'person' : 'tune')
)

/** Нижняя навигация: набор и подписи зависят от пресета (10.1/10.3). */
const tabs = computed(() => {
  const items = [{ name: 'orders', to: '/orders', label: t('order'), icon: 'receipt_long' }]

  if (isEnabled('store')) {
    items.push({ name: 'store', to: '/store', label: t('stock'), icon: 'inventory_2' })
  }

  items.push({ name: 'catalog', to: '/catalog', label: t('catalog'), icon: 'folder_open' })

  if (isEnabled('analytics')) {
    items.push({ name: 'analytic', to: '/analytic', label: 'аналитика', icon: 'insights' })
  }

  items.push({ name: 'other', to: '/other', label: 'ещё', icon: 'more_horiz' })

  return items
})

onMounted(() => {
  store.load()
  // 10.7: подтягиваем пресеты с сервера в read-only кэш. Best-effort: нет сети
  // или 401 — работаем из клиентских JSON / прошлого кэша.
  refreshTemplates().catch(() => {})
})

/** Переключение профиля — смена рабочего контекста, а не выход из аккаунта. */
async function selectProfile(id) {
  if (id === store.selectedId) return
  await store.select(id)
  // Уводим на всегда доступный раздел: набор вкладок мог измениться (10.3).
  if (route.path !== '/orders') {
    await router.replace('/orders')
  }
}

// Акцент профиля — только представление: подменяем брендовую переменную Quasar,
// фон и тему не трогаем (тёмная тема, следим за контрастом).
watch(
  () => resolveAccent(activeSpecialization.value),
  accent => setCssVar('primary', accent),
  { immediate: true }
)
</script>

<template>
  <q-layout view="lHh Lpr lFf">
    <!-- Шапка: переключатель рабочего профиля (10.8). Акцент профиля — в `primary`. -->
    <q-header class="lc-appbar bg-black">
      <q-toolbar class="q-py-none" dense>
        <q-btn-dropdown
          v-if="store.activeItems.length"
          flat
          dense
          no-caps
          color="primary"
          class="lc-profile"
          :icon="activeIcon"
          :label="activeSpecialization?.name"
        >
          <q-list dark style="min-width: 220px">
            <q-item-label header class="lc-eyebrow">рабочий профиль</q-item-label>
            <q-item
              v-for="option in profileOptions"
              :key="option.value"
              v-close-popup
              clickable
              :active="option.value === store.selectedId"
              active-class="text-primary"
              @click="selectProfile(option.value)"
            >
              <q-item-section avatar>
                <q-icon :name="option.icon" />
              </q-item-section>
              <q-item-section>{{ option.label }}</q-item-section>
              <q-item-section v-if="option.value === store.selectedId" side>
                <q-icon name="check" size="18px" />
              </q-item-section>
            </q-item>

            <q-separator dark />

            <q-item v-close-popup clickable @click="router.push('/other')">
              <q-item-section avatar><q-icon name="settings" /></q-item-section>
              <q-item-section>Управление профилями</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <q-space />

        <!-- Индикатор синка (6.2) — только значок (правка владельца 15.09.2026), тап —
             ручная синхронизация. Рядом мелкая серая версия приложения, чтобы «на глаз»
             видеть, какая сборка стоит. Бренд на узких экранах скрыт (`.lc-hide-sm`). -->
        <SyncStatusBar class="q-mr-sm" />

        <span v-if="appVersion" class="lc-app-version">{{ appVersion }}</span>

        <div class="lc-eyebrow lc-hide-sm q-ml-sm">Ledger Craft</div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Нижняя навигация: разделы приходят из `tabs` (состав — флаги пресета). -->
    <q-footer class="lc-tabbar">
      <q-tabs
        v-model="tab"
        dense
        no-caps
        align="justify"
        narrow-indicator
        active-color="secondary"
        indicator-color="secondary"
      >
        <q-route-tab
          v-for="item in tabs"
          :key="item.name"
          :to="item.to"
          :name="item.to"
          :label="item.label"
          :icon="item.icon"
          class="col"
        />
      </q-tabs>
    </q-footer>
  </q-layout>
</template>

<style scoped>
.lc-appbar {
  border-bottom: 1px solid var(--lc-border);
}

.lc-profile {
  font-weight: 700;
}

/* Версия приложения в шапке: очень мелко и серым — справочная строка, не акцент. */
.lc-app-version {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--lc-text-mute);
  font-variant-numeric: tabular-nums;
}
</style>

