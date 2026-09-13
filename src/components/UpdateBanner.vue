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

const label = computed(() =>
  update.downloading ? `загрузка ${update.downloadProgress}%` : view.value.label
)

/** На светлом фоне (secondary/warning) читается чёрный текст — как у индикатора синка. */
const textColor = computed(() => (['secondary', 'warning'].includes(view.value.color) ? 'black' : 'white'))

const showInstalledNotice = computed(() => Boolean(update.installedVersion))
const installedLabel = computed(() => `обновлено: сборка ${update.installedVersion}`)
</script>

<template>
  <div class="update-status">
    <!-- «Обновление установлено» — одноразовое сообщение после перезапуска. -->
    <q-btn
      v-if="showInstalledNotice"
      dense
      no-caps
      unelevated
      size="sm"
      class="lc-sync-chip text-caption"
      color="positive"
      text-color="black"
      icon="check_circle"
      :label="installedLabel"
      @click="update.clearInstalledNotice()"
    >
      <q-tooltip class="text-caption" max-width="260px">
        Приложение обновилось. Нажмите, чтобы скрыть сообщение.
      </q-tooltip>
    </q-btn>

    <q-btn
      v-else-if="view.visible || update.downloading"
      dense
      no-caps
      unelevated
      size="sm"
      class="lc-sync-chip text-caption"
      :color="view.color"
      :text-color="textColor"
      :icon="view.icon"
      :label="label"
      :loading="update.downloading"
      @click="dialogOpen = true"
    >
      <q-tooltip class="text-caption" max-width="280px">
        Нажмите, чтобы скачать и установить обновление
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
