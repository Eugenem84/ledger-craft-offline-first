<script setup>
// Диалог обновления приложения (Фаза 13, задача 13.13; OTA веб-слоя — Фаза 15).
//
// Два сценария в одном экране:
//   • OTA (веб-слой): «Обновить» скачивает бандл внутри приложения и назначает его
//     к применению при следующем запуске — без установки и без системных диалогов;
//     после скачивания можно перезапуститься сразу («Перезапустить сейчас»);
//   • APK (нативный слой): как в Фазе 13 — качаем APK с прогрессом и sha256 и зовём
//     системный установщик (или открываем ссылку в браузере, если плагина нет).
// Сценарий выбирает `useUpdateStore.otaMode` — он считается той же чистой функцией,
// что и баннер, поэтому вид и кнопки не разъезжаются.
import { computed, onMounted, ref } from 'vue'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'
import updateService from 'src/services/updateService.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
// «Что нового» — списком пунктов через тире (правка владельца 15.09.2026).
import { parseReleaseNotes } from 'src/utils/releaseNotes.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const update = useUpdateStore()

// Умеет ли приложение ставить APK само (задача 13.11). В браузере — нет.
// Спрашиваем только для нативного сценария: для OTA установщик не нужен.
const installerAvailable = ref(false)

onMounted(async () => {
  if (!update.otaMode) installerAvailable.value = await updateService.isInstallerAvailable()
})

const view = computed(() => update.view)
const closer = () => emit('update:modelValue', false)

const dialogTitle = computed(() =>
  update.otaMode ? 'Обновление без установки' : 'Обновление приложения'
)

/** Подзаголовок: что стоит сейчас (для OTA — ещё и версия самого бандла). */
const dialogSubtitle = computed(() => {
  const base = `установлено: ${update.currentLabel}`

  return update.otaMode && update.bundleVersion ? `${base} · обновление ${update.bundleVersion}` : base
})

/** Что нового: у бандла могут быть свои примечания, иначе — примечания релиза. */
const releaseNotes = computed(() =>
  parseReleaseNotes(update.otaMode ? update.bundle?.notes || update.releaseNotes : update.releaseNotes)
)

const busy = computed(() => update.downloading || update.downloadingBundle)
const progress = computed(() => (update.otaMode ? update.bundleProgress : update.downloadProgress))

const dismiss = () => {
  update.dismiss()
  closer()
}

const downloadInBrowser = async () => {
  await update.openDownloadPage()
  closer()
}

const startInstall = async () => {
  const started = await update.install()

  // Ошибку показываем здесь же (текст в `installError`), при успехе диалог
  // закрываем: дальше либо системный диалог установки, либо вкладка браузера.
  if (started && !update.installError) {
    closer()
  }
}

/** OTA: скачивание бандла. Диалог не закрываем — показываем «применится после перезапуска». */
const startBundleUpdate = async () => {
  await update.applyBundle()
}

/** OTA: применить скачанный бандл немедленно — приложение перезапустится. */
const restartNow = async () => {
  const restarted = await update.restartNow()

  if (restarted && !update.installError) closer()
}
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    :title="dialogTitle"
    :subtitle="dialogSubtitle"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="q-gutter-y-sm">
      <div class="row items-center no-wrap">
        <q-icon :name="view.icon" size="18px" :color="view.color" class="q-mr-sm" />
        <div>
          <div v-if="update.otaMode">Доступно обновление {{ update.bundleVersion }}</div>
          <div v-else>Доступна версия {{ update.releaseLabel }}</div>
          <div class="text-caption lc-mute">
            <span v-if="update.otaMode && update.bundleSize">размер {{ update.bundleSize }}</span>
            <span v-else-if="update.releaseSize">размер {{ update.releaseSize }}</span>
            <span v-if="view.kind === 'mandatory'" class="text-deep-orange">
              · обновление обязательно
            </span>
            <span v-if="view.kind === 'ota_ready'" class="text-positive">
              · применится после перезапуска
            </span>
          </div>
        </div>
      </div>

      <div v-if="releaseNotes.length" class="text-caption lc-muted">
        <div class="q-mb-xs">Что нового:</div>
        <div v-for="(note, index) in releaseNotes" :key="index">— {{ note }}</div>
      </div>

      <!-- Прогресс загрузки: виден, пока файл (или бандл) качается внутри приложения. -->
      <div v-if="busy">
        <q-linear-progress
          :value="progress / 100"
          color="secondary"
          track-color="grey-9"
          size="8px"
          class="q-mt-sm"
        />
        <div class="text-caption lc-mute q-mt-xs">Загрузка: {{ progress }}%</div>
      </div>

      <q-banner v-if="update.installError" dense class="bg-negative text-white q-mt-sm">
        {{ update.installError }}
      </q-banner>

      <div v-if="update.otaMode" class="text-caption lc-mute">
        Обновление скачается в приложение и применится при следующем запуске (или сразу, если
        нажать «Перезапустить сейчас»). Устанавливать ничего не нужно, данные и настройки
        сохранятся.
      </div>
      <div v-else-if="installerAvailable" class="text-caption lc-mute">
        Файл скачается в приложении, затем Android попросит подтвердить установку.
        Данные и настройки сохранятся.
      </div>
      <div v-else class="text-caption lc-mute">
        Откроется браузер: телефон скачает файл, после чего нужно тапнуть по нему и
        подтвердить установку. Данные и настройки сохранятся.
      </div>
    </div>

    <template #actions>
      <!-- OTA веб-слоя (Фаза 15): установки нет, есть скачивание и перезапуск. -->
      <template v-if="update.otaMode">
        <q-btn
          v-if="view.canDismiss"
          flat
          no-caps
          color="grey-5"
          label="Позже"
          :disable="busy"
          @click="dismiss"
        />
        <q-btn
          v-if="update.bundleReady"
          unelevated
          no-caps
          color="positive"
          text-color="black"
          icon="restart_alt"
          label="Перезапустить сейчас"
          :loading="update.applyingBundle"
          @click="restartNow"
        />
        <q-btn
          v-else
          unelevated
          no-caps
          color="secondary"
          text-color="black"
          icon="cloud_download"
          label="Обновить"
          :loading="update.applyingBundle"
          :disable="busy"
          @click="startBundleUpdate"
        />
      </template>

      <template v-else>
        <q-btn
          v-if="view.canDismiss"
          flat
          no-caps
          color="grey-5"
          label="Позже"
          :disable="busy"
          @click="dismiss"
        />
        <q-btn
          v-if="!installerAvailable"
          flat
          no-caps
          color="secondary"
          label="Скачать APK"
          :disable="busy"
          @click="downloadInBrowser"
        />
        <q-btn
          unelevated
          no-caps
          color="secondary"
          text-color="black"
          icon="system_update_alt"
          :label="installerAvailable ? 'Обновить' : 'Открыть ссылку'"
          :loading="update.installing"
          :disable="busy"
          @click="startInstall"
        />
      </template>
    </template>
  </LcDialogShell>
</template>
