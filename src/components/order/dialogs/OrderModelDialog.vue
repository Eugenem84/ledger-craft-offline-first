<script setup>
// Диалог «добавить модель техники» прямо из заказа (Фаза 8, задача 8.1).
import { ref, watch } from 'vue'
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const form = ref({ name: '' })

watch(
  () => props.modelValue,
  isOpen => {
    if (isOpen) form.value = { name: '' }
  }
)

const close = () => emit('update:modelValue', false)

const submit = () => {
  emit('submit', { name: form.value.name })
  close()
}
</script>

<template>
  <q-dialog
    :model-value="props.modelValue"
    persistent
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <q-card>
      <q-card-section>
        <div class="text-h6">Добавление: {{ t('model') }}</div>
        <q-input
          v-model="form.name"
          label-color="yellow"
          color="yellow"
          :label="`Название: ${t('model')}`"
          outlined
          class="q-mb-md"
        />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Отмена" color="yellow" @click="close" />
        <q-btn flat label="Добавить" color="yellow" @click="submit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
