<script setup>
// Диалог подтверждения удаления. Оболочка — общая `LcDialogShell`:
// кнопка разрушительного действия красная и стоит справа от «Отмены».
import { ref } from 'vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const props = defineProps({
  defaultTitle: { type: String, default: 'Подтверждение' },
  defaultMessage: { type: String, default: 'Действительно удалить?' },
})

const isOpen = ref(false)
const title = ref(props.defaultTitle)
const message = ref(props.defaultMessage)
let confirmCallback = () => {}

function open(newTitle, newMessage, onConfirm) {
  isOpen.value = true
  title.value = newTitle || props.defaultTitle
  message.value = newMessage || props.defaultMessage
  confirmCallback = onConfirm
}

function close() {
  isOpen.value = false
}

async function confirm() {
  await confirmCallback()
  close()
}

defineExpose({ open })
</script>

<template>
  <LcDialogShell
    :model-value="isOpen"
    :title="title"
    confirm-label="Удалить"
    confirm-color="negative"
    @update:model-value="isOpen = $event"
    @confirm="confirm"
  >
    <div class="lc-muted">{{ message }}</div>
  </LcDialogShell>
</template>

