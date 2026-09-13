<script setup>
// Диалог обновления приложения (Фаза 13, задача 13.13).
//
// Один и тот же экран для обоих путей: если нативный установщик есть — кнопка
// «Обновить» качает APK внутри приложения (с прогрессом и проверкой sha256) и
// зовёт системный диалог установки; если нет (веб-сборка или старый APK без
// плагина) — открывается системный браузер, где пользователь скачает файл сам.
import { computed, onMounted, ref } from 'vue'
import { useUpdateStore } from 'src/stores/useUpdateStore.js'
import updateService from 'src/services/updateService.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const update = useUpdateStore()

// Умеет ли приложение ставить APK само (задача 13.11). В браузере — нет.
const installerAvailable = ref(false)

onMounted(async () => {
  installerAvailable.value = await updateService.isInstallerAvailable()
})

const view = computed(() => update.view)
const closer = () => emit('update:modelValue', false)

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
</script>

<template>
  <LcDialogShell
    :model-value="props.modelValue"
    title="Обновление приложения"
    :subtitle="`установлено: ${update.currentLabel}`"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="q-gutter-y-sm">
      <div class="row items-center no-wrap">
        <q-icon name="system_update" size="18px" color="secondary" class="q-mr-sm" />
        <div>
          <div>Доступна версия {{ update.releaseLabel }}</div>
          <div class="text-caption lc-mute">
            <span v-if="update.releaseSize">размер {{ update.releaseSize }}</span>
            <span v-if="view.kind === 'mandatory'" class="text-deep-orange">
              · обновление обязательно
            </span>
          </div>
        </div>
      </div>

      <div v-if="update.releaseNotes" class="text-caption lc-muted">Что нового: {{ update.releaseNotes }}</div>

      <!-- Прогресс загрузки: виден, пока файл качается внутри приложения. -->
      <div v-if="update.downloading">
        <q-linear-progress
          :value="update.downloadProgress / 100"
          color="secondary"
          track-color="grey-9"
          size="8px"
          class="q-mt-sm"
        />
        <div class="text-caption lc-mute q-mt-xs">Загрузка: {{ update.downloadProgress }}%</div>
      </div>

      <q-banner v-if="update.installError" dense class="bg-negative text-white q-mt-sm">
        {{ update.installError }}
      </q-banner>

      <div v-if="installerAvailable" class="text-caption lc-mute">
        Файл скачается в приложении, затем Android попросит подтвердить установку.
        Данные и настройки сохранятся.
      </div>
      <div v-else class="text-caption lc-mute">
        Откроется браузер: телефон скачает файл, после чего нужно тапнуть по нему и
        подтвердить установку. Данные и настройки сохранятся.
      </div>
    </div>

    <template #actions>
      <q-btn
        v-if="view.canDismiss"
        flat
        no-caps
        color="grey-5"
        label="Позже"
        :disable="update.downloading"
        @click="dismiss"
      />
      <q-btn
        v-if="!installerAvailable"
        flat
        no-caps
        color="secondary"
        label="Скачать APK"
        :disable="update.downloading"
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
        :disable="update.downloading"
        @click="startInstall"
      />
    </template>
  </LcDialogShell>
</template>
