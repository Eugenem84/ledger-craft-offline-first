<script setup>
// Шапка страницы заказа (Фаза 8, задача 8.1): кнопки действий, номер заказа,
// переключатели статуса и «оплачено». Логика — в `useOrderDraftStore`, здесь только события.
import { computed } from 'vue'

const props = defineProps({
  editMode: { type: Boolean, default: false },
  isNewOrder: { type: Boolean, default: false },
  orderNumber: { type: [String, Number], default: null },
  status: { type: String, default: 'waiting' },
  paid: { type: Boolean, default: false },
  /** Блокировка кнопки share-ссылки, пока идёт запрос. */
  busy: { type: Boolean, default: false },
})

const emit = defineEmits([
  'back',
  'share',
  'clear',
  'remove',
  'edit',
  'save',
  'update:status',
  'update:paid',
])

const statusOptions = [
  { label: 'ожид', value: 'waiting' },
  { label: 'враб', value: 'process' },
  { label: 'готово', value: 'done' },
]

const toggleColor = computed(() => {
  switch (props.status) {
    case 'waiting':
      return 'orange'
    case 'process':
      return 'red'
    case 'done':
      return 'green'
    default:
      return 'yellow'
  }
})
</script>

<template>
  <div class="row justify-between">
    <q-btn
      flat
      color="yellow"
      :label="editMode ? 'отмена' : 'НАЗАД'"
      @click="emit('back')"
      size="md"
      class="btn-flex"
    />

    <q-btn
      color="black"
      icon="link"
      text-color="yellow"
      @click="emit('share')"
      :loading="busy"
      class="btn-flex"
    />

    <q-btn v-if="editMode" flat size="md" color="yellow" label="очистить" @click="emit('clear')" />

    <div v-if="orderNumber">
      <a style="color: grey; font-size: 12px">№</a>
      <a style="color: yellow; font-size: 17px; padding-top: 5px; display: inline-block">
        {{ orderNumber }}
      </a>
    </div>

    <div>
      <q-btn
        flat
        v-if="!editMode"
        size="md"
        color="yellow"
        class="justify-end"
        icon="delete_forever"
        @click="emit('remove')"
      />

      <q-btn v-if="!editMode" flat size="md" color="yellow" label="РЕД" @click="emit('edit')" />
      <q-btn v-if="editMode" flat size="md" color="yellow" label="сохр" @click="emit('save')" />
    </div>

    <div class="items-center row q-gutter-x-md">
      <q-btn-toggle
        :model-value="status"
        size="md"
        outline
        glossy
        :toggle-color="toggleColor"
        color="grey"
        @update:model-value="value => emit('update:status', value)"
        :options="statusOptions"
      />

      <q-btn
        outline
        size="md"
        @click="emit('update:paid', !paid)"
        :color="paid ? 'green' : 'grey'"
        glossy
        label="опл"
      />
    </div>
  </div>
</template>
