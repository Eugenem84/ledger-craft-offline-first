<script setup>
// src/layouts/MainLayout.vue
//
// Каркас приложения: шапка с активным рабочим профилем (Фаза 10, задачи 10.2/10.8)
// и нижние вкладки, состав которых зависит от пресета (задача 10.3).
//
// Что появилось в Фазе 10:
//   • бейдж/переключатель профиля в шапке (раньше селект был спрятан в «Другие»);
//   • акцентный цвет профиля — runtime `setCssVar` (без пересборки SCSS);
//   • вкладки «склад»/«аналитика» скрываются флагами пресета;
//   • подписи вкладок берутся из лексикона специализации (задача 10.1).
  import { computed, onMounted, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { setCssVar } from 'quasar'
  import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
  import { useFeatures } from 'src/domain/features.js'
  import { useLexicon } from 'src/domain/lexicon.js'
  import { resolveAccent } from 'src/domain/theme.js'
  import { getPreset } from 'src/domain/presets/index.js'
  import { refreshTemplates } from 'src/services/presetService.js'

  const store = useSpecializationsStore()
  const router = useRouter()
  const { isEnabled } = useFeatures()
  const { t } = useLexicon()

  const tab = ref('/orders')

  /** Профили для переключателя (архивированные скрыты). */
  const profileOptions = computed(() =>
    store.activeItems.map(item => ({
      value: item.id,
      label: item.name,
      icon: getPreset(item.preset_key)?.icon || 'person',
    }))
  )

  const activeSpecialization = computed(() => store.getSelectedSpecialization)
  const activeIcon = computed(() =>
    store.activePreset?.icon || (activeSpecialization.value ? 'person' : 'tune')
  )

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
    if (router.currentRoute.value.path !== '/orders') {
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
  <q-layout view="lHh Lpr lFf " class="bg-black">

    <!-- Шапка: бейдж + переключатель рабочего профиля (Фаза 10, 10.8). -->
    <q-header v-if="!$route.meta.hideFooter" class="bg-black">
      <q-toolbar class="q-py-none" dense>
        <q-btn-dropdown
          v-if="store.activeItems.length"
          flat
          dense
          no-caps
          color="primary"
          text-color="white"
          :icon="activeIcon"
          :label="activeSpecialization?.name"
        >
          <q-list dark>
            <q-item
              v-for="option in profileOptions"
              :key="option.value"
              v-close-popup
              clickable
              :active="option.value === store.selectedId"
              @click="selectProfile(option.value)"
            >
              <q-item-section avatar>
                <q-icon :name="option.icon" />
              </q-item-section>
              <q-item-section>{{ option.label }}</q-item-section>
            </q-item>
            <q-separator dark />
            <q-item v-close-popup clickable @click="router.push('/other')">
              <q-item-section avatar><q-icon name="settings" /></q-item-section>
              <q-item-section>Управление профилями</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <q-space />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view>
      </router-view>
    </q-page-container>

    <q-footer v-if="!$route.meta.hideFooter" elevated class="bg-primary text-white">
      <q-separator color="grey" />

      <q-tabs
        v-model="tab"
        dense
        :class="$q.dark.isActive ? 'bg-black' : 'bg-black' "
        align="justify"
        narrow-indicator
        class="tabs"
        indicator-color="yellow"
      >
        <q-route-tab to="/orders"
                     name="orders"
                     :label="t('order')"
                     icon="list"
                     class="flex-grow col-3 text-caption"
        ></q-route-tab>

        <q-route-tab v-if="isEnabled('store')"
                     to="/store"
                     name="store"
                     :label="t('stock')"
                     icon="storage"
                     class="flex-grow col-2 text-caption"
        ></q-route-tab>

        <q-route-tab to="/catalog"
                     name="catalog"
                     :label="t('catalog')"
                     icon="folder"
                     class="flex-grow col-3 text-caption"
        ></q-route-tab>

        <q-route-tab v-if="isEnabled('analytics')"
                     to="/analytic"
                     name="analytic"
                     label="аналитика"
                     icon="bar_chart"
                     class="flex-grow col-3 text-caption"
        ></q-route-tab>

        <q-route-tab to="/other"
                     name="other"
                     label="другие"
                     icon="more_horiz"
                     class="flex-grow col-1 text-caption"
        ></q-route-tab>

      </q-tabs>

    </q-footer>

  </q-layout>
</template>

<style scoped></style>
