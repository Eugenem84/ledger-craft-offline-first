<script setup>
import { ref } from "vue";

const props = defineProps({
  defaultTitle: { type: String, default: 'Подтверждение' },
  defaultMessage: { type: String, default: 'Действительно удалить?' }
});

const isOpen = ref(false);
const title = ref(props.defaultTitle);
const message = ref(props.defaultMessage);
let confirmCallback = () => {};

function open(newTitle, newMessage, onConfirm) {
  isOpen.value = true;
  title.value = newTitle || props.defaultTitle;
  message.value = newMessage || props.defaultMessage;
  confirmCallback = onConfirm;
}

function close() {
  isOpen.value = false;
}

async function confirm() {
  await confirmCallback();
  close();
}

defineExpose({open});
</script>

<template>
  <q-dialog v-model="isOpen">
    <q-card>
      <q-card-section>
        <div class="text-h6">{{ title }}</div>
        <div>{{ message }}</div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn
          flat
          label="отмена"
          color="yellow"
          @click="close"
        />
        <q-btn
          flat
          label="удалить"
          color="red"
          @click="confirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
