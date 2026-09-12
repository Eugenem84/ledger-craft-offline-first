<script setup>
// Селекторы клиента и модели техники (Фаза 8, задача 8.1).
// В режиме просмотра — поля с телефоном/названием, в режиме правки — выбор из справочника
// и кнопки «+» (быстрое создание клиента/модели прямо из заказа).
import { ref, watch } from 'vue'
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  editMode: { type: Boolean, default: false },
  client: { type: Object, default: () => ({ id: null, name: '', phone: '' }) },
  model: { type: Object, default: () => ({ id: null, name: null }) },
  clients: { type: Array, default: () => [] },
  models: { type: Array, default: () => [] },
  /** Показ блока «модель техники»: у части ниш он не нужен (Фаза 10, задача 10.3). */
  showModel: { type: Boolean, default: true },
})

const emit = defineEmits(['update:client', 'update:model', 'add-client', 'add-model'])

// Фильтр внутри компонента: раньше список `filteredClients` держала страница.
const filteredClients = ref([...props.clients])

watch(
  () => props.clients,
  clients => {
    filteredClients.value = [...clients]
  }
)

const filterClients = (value, update) => {
  const query = String(value || '').toLowerCase()
  update(() => {
    filteredClients.value =
      query === ''
        ? [...props.clients]
        : props.clients.filter(
            client =>
              client.name?.toLowerCase().includes(query) ||
              (client.phone && String(client.phone).toLowerCase().includes(query))
          )
  })
}
</script>

<template>
  <div class="row items-center q-col-gutter-md">
    <!-- Клиент -->
    <div class="col">
      <!-- Режим редактирования -->
      <q-select
        v-if="editMode"
        :model-value="client"
        :options="filteredClients"
        option-value="id"
        :option-label="option => (option ? `${option.name} ${option.phone}` : 'Выберите клиента')"
        :label="t('client')"
        color="yellow"
        use-input
        fill-input
        hide-selected
        input-debounce="300"
        behavior="menu"
        map-options
        @filter="filterClients"
        @update:model-value="value => emit('update:client', value)"
        placeholder="Выберите клиента"
        outlined
      />

      <!-- Режим просмотра -->
      <q-field
        v-if="!editMode"
        :label="t('client')"
        stack-label
        tabindex="-1"
        style="pointer-events: auto"
        label-color="grey"
      >
        <div class="column">
          <div class="text-subtitle1 text-yellow">{{ client?.name }}</div>
          <a
            v-if="client?.phone"
            :href="'tel:' + client.phone"
            class="text-yellow text-bold text-body2"
          >
            {{ client.phone }}
          </a>
        </div>
      </q-field>
    </div>

    <!-- Кнопка для добавления клиента (если в режиме редактирования) -->
    <div class="col-auto" v-if="editMode">
      <q-btn class="text-yellow" @click="emit('add-client')">+</q-btn>
    </div>

    <!-- Модель (у части ниш блок скрыт флагом пресета, задача 10.3) -->
    <div class="col" v-if="props.showModel">
      <!-- Режим редактирования -->
      <q-select
        v-if="editMode"
        :model-value="model"
        :options="models"
        outlined
        option-value="id"
        option-label="name"
        :label="t('model')"
        color="yellow"
        @update:model-value="value => emit('update:model', value)"
      />

      <!-- Режим просмотра -->
      <q-field v-if="!editMode" :label="t('model')" stack-label tabindex="-1" style="pointer-events: none">
        <div class="text-subtitle1 text-yellow">{{ model?.name || '—' }}</div>
      </q-field>
    </div>

    <!-- Кнопка для добавления модели (если в режиме редактирования) -->
    <div class="col-auto" v-if="editMode && props.showModel">
      <q-btn class="text-yellow" @click="emit('add-model')">+</q-btn>
    </div>
  </div>
</template>
