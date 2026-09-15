<script setup>
// Чип «доступна версия N» (Фаза 13, задачи 13.9/13.13).
//
// Живёт рядом с индикатором синка в `App.vue`, поэтому виден на всех маршрутах.
// Состояние берётся из `useUpdateStore` (который слушает `updateService`), а
// приоритеты («обязательно», «отложено») считает чистая `appUpdateView`.
//
// Тап открывает `UpdateDialog` — там прогресс и системная установка.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'
import UpdateDialog from 'src/components/UpdateDialog.vue'

const update = useUpdateStore()
const dialogOpen = ref(false)
const view = computed(() => update.view)

// Подписка на сервис — на время жизни компонента (он один, в `App.vue`).
// `bind()` заодно поднимает разовое сообщение «обновление установлено»: оно
// появляется, когда текущая нативная версия стала не ниже той, установку которой
// мы запускали (после установки Android закрывает приложение, задача 13.13).
onMounted(() => update.bind())

onBeforeUnmount(() => update.unbind())

const label = computed(() => {
  if (update.downloading) return `загрузка ${update.downloadProgress}%`
  if (update.downloadingBundle) return `загрузка ${update.bundleProgress}%`

  return view.value.label
})

/** На светлом фоне (secondary/warning/positive) читается чёрный текст — как у индикатора синка. */
const textColor = computed(() =>
  ['secondary', 'warning', 'positive'].includes(view.value.color) ? 'black' : 'white'
)

/**
 * Разовое сообщение «уже обновилось»: установка APK (Фаза 13) или OTA-бандл (Фаза 15).
 * Оба состояния снимаются одним тапом.
 */
const notice = computed(() => {
  if (update.installedVersion) {
    return {
      label: `обновлено: сборка ${update.installedVersion}`,
      tooltip: 'Приложение обновилось. Нажмите, чтобы скрыть сообщение.',
    }
  }

  if (update.appliedBundleVersion) {
    return {
      label: `обновление ${update.appliedBundleVersion} применено`,
      tooltip: 'Обновление без установки применено. Нажмите, чтобы скрыть сообщение.',
    }
  }

  return null
})

const clearNotice = () => {
  update.clearInstalledNotice()
  update.clearAppliedBundleNotice()
}

/** Подсказка к чипу: у OTA другой смысл действия, чем у установки APK. */
const hint = computed(() => {
  if (view.value.kind === 'ota_ready') {
    return 'Обновление скачано — перезапустите приложение, чтобы применить'
  }

  if (view.value.kind === 'ota') {
    return 'Нажмите, чтобы скачать обновление без установки'
  }

  return 'Нажмите, чтобы скачать и установить обновление'
})
</script>

<template>
  <div class="update-status">
    <!-- «Обновление установлено/применено» — одноразовое сообщение после перезапуска. -->
    <q-btn
      v-if="notice"
      dense
      no-caps
      unelevated
      size="sm"
      class="lc-sync-chip text-caption"
      color="positive"
      text-color="black"
      icon="check_circle"
      :label="notice.label"
      @click="clearNotice"
    >
      <q-tooltip class="text-caption" max-width="260px">
        {{ notice.tooltip }}
      </q-tooltip>
    </q-btn>

    <q-btn
      v-else-if="view.visible || update.downloading || update.downloadingBundle"
      dense
      no-caps
      unelevated
      size="sm"
      class="lc-sync-chip text-caption"
      :color="view.color"
      :text-color="textColor"
      :icon="view.icon"
      :label="label"
      :loading="update.downloading || update.downloadingBundle"
      @click="dialogOpen = true"
    >
      <q-tooltip class="text-caption" max-width="280px">
        {{ hint }}
      </q-tooltip>
    </q-btn>
  </div>

  <UpdateDialog v-model="dialogOpen" />
</template>

<style scoped>
/* Выше плавающего индикатора синка (он на 72px вне `MainLayout`), чтобы чипы не накладывались. */
.update-status {
  position: fixed;
  left: 10px;
  bottom: calc(108px + env(safe-area-inset-bottom, 0px));
  z-index: 1900;
}
</style>
