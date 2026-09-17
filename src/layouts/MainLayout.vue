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
//
// Правка владельца 17.09.2026: разделы можно листать свайпом (жест + короткий переход,
// решение — `utils/tabSwipe.js`), а под интерфейсом живёт картинка-фон активной
// специализации (`components/ui/LcAppBackground.vue`), которая едет при листании.
// Поверхности остаются сплошными, пока картинки нет: «стеклянный» вид включается
// классом `.lc-has-bg` только при наличии файла (см. `app.scss`).
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { setCssVar } from 'quasar'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
import { useFeatures } from 'src/domain/features.js'
import { useLexicon } from 'src/domain/lexicon.js'
import { resolveAccent } from 'src/domain/theme.js'
import { getPreset } from 'src/domain/presets/index.js'
import { refreshTemplates } from 'src/services/presetService.js'
import { resolveBackgroundUrl } from 'src/services/backgroundAssets.js'
import {
  backgroundShift,
  isEdgeGesture,
  resolveSwipe,
  swipeTransitionName,
  tabIndexByPath,
} from 'src/utils/tabSwipe.js'
import SyncStatusBar from 'src/components/SyncStatusBar.vue'
import LcAppBackground from 'src/components/ui/LcAppBackground.vue'
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

/** Профили для переключателя (архивированные скрыты). */
const profileOptions = computed(() =>
  store.activeItems.map((item) => ({
    value: item.id,
    label: item.name,
    icon: getPreset(item.preset_key)?.icon || 'person',
  })),
)

const activeSpecialization = computed(() => store.getSelectedSpecialization)
const activeIcon = computed(
  () => store.activePreset?.icon || (activeSpecialization.value ? 'person' : 'tune'),
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

// Далее — свайп и фон. Всё, что можно посчитать без Vue/Quasar, живёт в
// `utils/tabSwipe.js` (там же объяснение, почему порядок вкладок — это порядок
// таббара, а не `routes.js`); здесь — состояние каркаса и подписка на жест.

/** Индекс активной вкладки в `tabs` (-1 — текущий путь не вкладка). */
const tabIndex = computed(() => tabIndexByPath(tabs.value, route.path))

/** Индекс до перехода: по нему понятно, с какой стороны входит новая страница. */
const previousTabIndex = ref(tabIndex.value)

/** Имя CSS-перехода (`lc-swipe-next` / `lc-swipe-prev`); пусто — перехода нет. */
const transitionName = ref('')

// Сторону перехода считаем по индексу вкладки: и свайп, и тап по таббару через две
// вкладки дают одинаковую анимацию (входящая страница приходит со стороны движения).
// Индекс прошлого пути держим в `previousTabIndex`, потому что к моменту `watch`
// `route.path` уже указывает на новый раздел.
watch(
  () => route.path,
  (path) => {
    const next = tabIndexByPath(tabs.value, path)

    transitionName.value = swipeTransitionName(previousTabIndex.value, next)
    previousTabIndex.value = next
    tab.value = path
  },
)

/** URL картинки-фона активного профиля; `null` — фон остаётся чёрным, как раньше. */
const appBackgroundUrl = computed(() => resolveBackgroundUrl(store.getSelectedSpecialization))

/** Есть ли картинка: только тогда поверхности становятся полупрозрачными (`.lc-has-bg`). */
const hasBackground = computed(() => appBackgroundUrl.value !== null)

/** Сдвиг картинки для активной вкладки (параллакс при листании). */
const backgroundShiftPercent = computed(() => backgroundShift(tabIndex.value, tabs.value.length))

/**
 * Жест «израсходован». Директива `v-touch-swipe` зовёт обработчик на каждом движении
 * пальца, поэтому один свайп = один переход: взвели на касании — сняли после перехода.
 */
const swipeArmed = ref(false)

/** Координата начала жеста: у краёв экрана жест принадлежит системе, а не нам. */
const swipeStartX = ref(Number.NaN)

/**
 * Начало касания. Кроме «системных» краёв проверяем, не касается ли палец открытого
 * окна: `q-dialog` рендерится внутри страницы, и без этой проверки свайп по подложке
 * увёл бы раздел под открытым диалогом (а заполненная форма потерялась бы — Quasar
 * закрывает диалог при смене маршрута).
 */
function onSwipeStart(evt) {
  swipeArmed.value = false

  const target = evt?.target
  if (typeof target?.closest === 'function' && target.closest('.q-dialog, .q-menu') != null) return

  const touch = evt?.touches?.[0]
  swipeArmed.value = true
  swipeStartX.value = touch ? touch.clientX : Number.NaN
}

/** Конец касания — свайп «разряжен», следующее движение не переключает раздел. */
function onSwipeEnd() {
  swipeArmed.value = false
}

/** Свайп по контенту: переходим на соседний раздел (порядок — как в таббаре). */
function onSwipe(info) {
  if (isEdgeGesture(swipeStartX.value, window.innerWidth)) return

  const target = resolveSwipe(info, tabs.value, route.path, swipeArmed.value)
  if (target === null) return

  swipeArmed.value = false
  void router.push(target)
}

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
  (accent) => setCssVar('primary', accent),
  { immediate: true },
)
</script>

<template>
  <q-layout view="lHh Lpr lFf" :class="{ 'lc-has-bg': hasBackground }">
    <!-- Фон активного профиля. Лежит под контентом (слой `fixed` + `z-index: -1`),
         меняется кроссфейдом при смене профиля и едет при листании разделов. -->
    <LcAppBackground :url="appBackgroundUrl" :shift="backgroundShiftPercent" />

    <!-- Шапка: переключатель рабочего профиля (10.8). Акцент профиля — в `primary`. -->
    <q-header class="lc-appbar">
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

    <!--
      Свайп по разделам (правка владельца 17.09.2026).

      • `v-touch-swipe:0.25:24.horizontal` — жест распознаёт Quasar: порог по скорости
        0.25 px/мс (быстрее дефолтных 0.06) и 24px хода до решения, только горизонталь.
        Заметно строже дефолта специально: на длинном списке дефолт принимал за свайп
        диагональную прокрутку, и раздел менялся при скролле.
      • `@touchstart`/`@touchend` — свои: директива зовёт обработчик на каждом движении
        пальца, поэтому «один свайп = один переход» и координата начала жеста считаются
        здесь (см. `onSwipeStart`).
      • `lc-viewport` — клип по горизонтали: входящая страница стартует за краем экрана.
    -->
    <q-page-container
      class="lc-viewport"
      v-touch-swipe:0.25:24.horizontal="onSwipe"
      @touchstart.passive="onSwipeStart"
      @touchend="onSwipeEnd"
      @touchcancel="onSwipeEnd"
    >
      <!--
        `mode="out-in"` — страницы не накладываются друг на друга (иначе контейнер
        на кадр становится вдвое выше и список «прыгает»). Слайд только у входящей
        страницы, уходящая просто гаснет: `transform` на странице сломал бы
        `position: fixed` у плавающей кнопки, а её и так переносит в `body` (см. `LcFab`).
        При пустом `transitionName` CSS-перехода нет — раздел меняется мгновенно.
      -->
      <router-view v-slot="{ Component }">
        <Transition :name="transitionName" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
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
/* Фон шапки — токен (а не класс `bg-black`): при наличии фоновой картинки шапка
   становится полупрозрачной («стекло»), см. `.lc-has-bg` в `app.scss`. */
.lc-appbar {
  background: var(--lc-chrome);
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
