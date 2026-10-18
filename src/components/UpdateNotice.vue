<script setup>
// Крупное уведомление об обновлении сверху — «пуш» с «Что нового» и кнопками
// «Установить» / «Позже» (задача 14.37, правка владельца 19.10.2026).
//
// Зачем отдельно от чипа `UpdateBanner`: чип появился в углу и его легко не заметить,
// а мастеру нужно сразу видеть, **что именно** изменилось, и иметь возможность
// обновиться одним тапом. Текст и состояние берём из `updateNoticeView` (чистая
// функция), действия — у `useUpdateStore`, чтобы не дублировать сценарии обновления:
//   • OTA-бандл: «Установить» скачивает его, дальше кнопка становится «Перезапустить»;
//   • APK: «Установить» зовёт тот же `install()`, что и диалог (установщик/браузер).
// «Позже» — это `update.dismiss()`: тот же смысл, что у кнопки в диалоге (не
// напоминать до следующего релиза). Для обязательного обновления «Позже» нет.
import { computed } from 'vue'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'
import { updateNoticeView } from 'src/utils/updateNotice.js'

const update = useUpdateStore()

const notice = computed(() => updateNoticeView(update.status))

/** Идёт скачивание/установка — кнопки блокируем, показываем прогресс. */
const busy = computed(
  () =>
    update.downloading === true ||
    update.downloadingBundle === true ||
    update.applyingBundle === true ||
    update.installing === true
)

const progress = computed(() =>
  notice.value.kind === 'ota' ? update.bundleProgress : update.downloadProgress
)

/** Иконка в шапке «пуша»: до скачивания — обновление, после — «готово». */
const headIcon = computed(() => (notice.value.kind === 'ota_ready' ? 'check_circle' : 'system_update'))

const postpone = () => update.dismiss()

/**
 * «Установить»: OTA — скачать бандл (применится при следующем запуске), скачанный —
 * перезапустить сейчас, APK — обычный путь установки (задача 13.13).
 */
async function install() {
  if (notice.value.kind === 'ota_ready') {
    await update.restartNow()

    return
  }

  if (notice.value.kind === 'ota') {
    await update.applyBundle()

    return
  }

  await update.install()
}
</script>

<template>
  <transition name="lc-update-notice">
    <div v-if="notice.visible" class="lc-update-notice" role="status" aria-live="polite">
      <div class="lc-update-notice__head">
        <q-icon :name="headIcon" size="22px" class="lc-update-notice__icon" />
        <div class="lc-update-notice__titles">
          <div class="lc-update-notice__title">{{ notice.title }}</div>
          <div v-if="notice.subtitle" class="text-caption lc-mute">{{ notice.subtitle }}</div>
        </div>
      </div>

      <template v-if="notice.notes.length">
        <div class="lc-update-notice__section">Что нового</div>
        <ul class="lc-update-notice__notes">
          <li v-for="(note, index) in notice.notes" :key="index">{{ note }}</li>
        </ul>
      </template>

      <div v-if="busy">
        <q-linear-progress
          :value="progress / 100"
          color="secondary"
          track-color="grey-9"
          size="6px"
          class="q-mt-sm"
        />
        <div class="text-caption lc-mute q-mt-xs">Загрузка: {{ progress }}%</div>
      </div>

      <q-banner v-if="update.installError" dense class="bg-negative text-white q-mt-sm">
        {{ update.installError }}
      </q-banner>

      <div class="lc-update-notice__actions">
        <q-btn
          v-if="notice.canDismiss"
          flat
          no-caps
          dense
          color="grey-5"
          label="Позже"
          :disable="busy"
          @click="postpone"
        />
        <q-btn
          unelevated
          no-caps
          dense
          color="secondary"
          text-color="black"
          :icon="notice.actionIcon"
          :label="notice.actionLabel"
          :loading="busy"
          :disable="busy"
          @click="install"
        />
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* Верх экрана: «пуш» перекрывает шапку, но не модальные окна (у Quasar они выше).
   Ширина ограничена, чтобы на планшете карточка не растягивалась на весь экран. */
.lc-update-notice {
  position: fixed;
  top: calc(8px + env(safe-area-inset-top, 0px));
  left: 10px;
  right: 10px;
  z-index: 1850;
  max-width: 520px;
  margin-inline: auto;
  padding: 12px var(--lc-pad-card);
  background: var(--lc-surface-2);
  border: 1px solid var(--lc-border-strong);
  border-left: 3px solid var(--lc-accent);
  border-radius: var(--lc-radius);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.lc-update-notice__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.lc-update-notice__icon {
  color: var(--lc-accent);
  flex: 0 0 auto;
}

.lc-update-notice__titles {
  min-width: 0;
  flex: 1 1 auto;
}

.lc-update-notice__title {
  font-weight: 600;
  line-height: 1.25;
}

.lc-update-notice__section {
  margin-top: 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lc-text-mute);
}

.lc-update-notice__notes {
  margin: 4px 0 0;
  padding-left: 18px;
  max-height: 34vh;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.35;
}

.lc-update-notice__notes li + li {
  margin-top: 2px;
}

.lc-update-notice__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.lc-update-notice-enter-active,
.lc-update-notice-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.lc-update-notice-enter-from,
.lc-update-notice-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
