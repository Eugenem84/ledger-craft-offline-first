<script setup>
// Единая оболочка диалога: заголовок, тело, «Отмена» + основная кнопка.
//
// Раньше каждый диалог сам решал, каким цветом и в каком порядке рисовать кнопки,
// и задавал `style="min-width: 400px"` — на телефоне 360–390px окно вылезало за
// экран. Теперь ширина адаптивная (см. `.q-dialog .q-card` в `app.scss`), а
// кнопки одинаковы во всех диалогах.
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Сохранить' },
  cancelLabel: { type: String, default: 'Отмена' },
  confirmColor: { type: String, default: 'secondary' },
  /** `auto` — белый на тёмных кнопках, чёрный на жёлтых/зелёных. */
  confirmTextColor: { type: String, default: 'auto' },
  confirmDisable: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const close = () => emit('update:modelValue', false)

/** Светлые фоны (жёлтый/янтарный) просят чёрный текст, остальные — белый. */
const resolvedTextColor = computed(() =>
  props.confirmTextColor === 'auto'
    ? ['secondary', 'warning'].includes(props.confirmColor)
      ? 'black'
      : 'white'
    : props.confirmTextColor
)
</script>

<template>
  <q-dialog
    :model-value="props.modelValue"
    persistent
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <q-card class="lc-dialog">
      <q-card-section class="row items-start no-wrap">
        <div class="col">
          <div class="text-subtitle1">{{ props.title }}</div>
          <div v-if="props.subtitle" class="text-caption lc-mute">{{ props.subtitle }}</div>
        </div>
        <q-btn flat round dense icon="close" color="grey-6" @click="close" />
      </q-card-section>

      <q-separator dark />

      <q-card-section class="lc-dialog__body">
        <slot />
      </q-card-section>

      <q-separator dark />

      <q-card-actions align="right" class="q-pa-md">
        <slot name="actions">
          <q-btn flat no-caps color="grey-5" :label="props.cancelLabel" @click="close" />
          <q-btn
            unelevated
            no-caps
            :color="props.confirmColor"
            :text-color="resolvedTextColor"
            :label="props.confirmLabel"
            :disable="props.confirmDisable"
            :loading="props.loading"
            @click="emit('confirm')"
          />
        </slot>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.lc-dialog {
  width: 100%;
  max-width: 440px;
}

.lc-dialog__body {
  max-height: 65vh;
  overflow: auto;
}
</style>
