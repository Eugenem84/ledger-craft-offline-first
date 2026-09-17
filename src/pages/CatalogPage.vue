<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import NewClientDialogPage from 'pages/dialogs/NewClientDialogPage.vue'
import NewServiceDialogPage from 'pages/dialogs/NewServiceDialogPage.vue'
import NewServiceCategoryDialogPage from 'pages/dialogs/NewServiceCategoryDialogPage.vue'
// Общие UI-элементы (переработка интерфейса).
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import LcEmptyState from 'src/components/ui/LcEmptyState.vue'
import LcFab from 'src/components/ui/LcFab.vue'
import LcPageHeader from 'src/components/ui/LcPageHeader.vue'

import { useClientsStore } from 'stores/useClientsStore.js'
import { useCategoriesStore } from 'stores/useCategoriesStore.js'
import { useServicesStore } from 'stores/useServicesStore.js'
// Ошибки каталога — в постоянный буфер (`utils/errorLog.js`), иначе в отчёте мастера
// «Сообщить об ошибке» нет причины (дефект разбора отчёта №2, 14.09.2026).
import { logger } from 'src/utils/logger'
// Фаза 10: лексикон ниши (10.1) и активный рабочий профиль (смена профиля — 10.8).
import { useSpecializationsStore } from 'stores/useSpecializationsStore.js'
import { useLexicon } from 'src/domain/lexicon.js'

const $q = useQuasar()
const router = useRouter()
const { t } = useLexicon()

const clientsStore = useClientsStore()
const categoriesStore = useCategoriesStore()
const servicesStore = useServicesStore()
const specializationsStore = useSpecializationsStore()

const newClientDialog = ref(null)
const newServiceDialog = ref(null)
const newServiceCategoryDialog = ref(null)

const confirmDialog = ref(null)

const tab = ref('services')

/** FAB зависит от вкладки: «работа» или «клиент». */
const fabLabel = () => (tab.value === 'clients' ? 'новый клиент' : `новая ${t('service')}`)

const editClientMode = ref(false)
const editServiceMode = ref(false)
const editCategoryMode = ref(false)

const selectedClient = ref(null)
const selectedService = ref(null)
const selectedServiceCategory = ref(null)

const showClientsDetails = ref(false)
const showServiceDetails = ref(false)
const showCategoryDetails = ref(false)

onMounted(async () => {
  // Строгий фильтр по активному профилю (Фаза 10): иначе в каталог попадали
  // категории и клиенты всех ниш (например, «Дозаправка фреона» у аквариумов).
  const specializationId = specializationsStore.selectedId
  await clientsStore.load(specializationId)
  await categoriesStore.load(specializationId)
})

// Смена рабочего профиля (задача 10.8) меняет и каталог, и клиентов: перечитываем
// их при переключении, чтобы страница не показывала данные прошлой ниши.
watch(
  () => specializationsStore.selectedId,
  async () => {
    selectedServiceCategory.value = null
    servicesStore.items = []
    await clientsStore.load(specializationsStore.selectedId)
    await categoriesStore.load(specializationsStore.selectedId)
  }
)

watch(selectedServiceCategory, (newCategory) => {
  servicesStore.load(newCategory?.id)
});

function handleDelete(){
  if (showClientsDetails.value) {
    confirmDialog.value.open('Удаление клиента', `Вы уверены что хотите удалить клиента "${selectedClient.value.name}" ?`, deleteClient)
  } else if (showServiceDetails.value){
    confirmDialog.value.open('Удаление услуги', `Вы уверены что хотите удалить сервис "${selectedService.value.service}"`, deleteService)
  } else if (showCategoryDetails.value) {
    confirmDialog.value.open('Удаление категории', `Вы уверены что хотите удалить категорию "${selectedServiceCategory.value.category_name}" ?`, deleteCategory)
  }
}

const deleteClient = async () => {
  try {
    await clientsStore.remove(selectedClient.value.id)
    showClientsDetails.value = false
    $q.notify({ type: 'positive', message: 'Клиент удален', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка удаления клиента', position: "top", timeout: 1000 })
    logger.error('[Catalog] Не удалось удалить клиента:', err)
  }
}

const deleteCategory = async () => {
  try {
    await categoriesStore.remove(selectedServiceCategory.value.id)
    showCategoryDetails.value = false
    selectedServiceCategory.value = null
    $q.notify({ type: 'positive', message: 'Категория удалена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка удаления категории', position: "top", timeout: 1000 })
    logger.error('[Catalog] Не удалось удалить категорию:', err)
  }
}

const deleteService = async () => {
  try {
    await servicesStore.remove(selectedService.value.id)
    showServiceDetails.value = false
    $q.notify({ type: 'positive', message: 'Услуга удалена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка удаления услуги', position: "top", timeout: 1000 })
    logger.error('[Catalog] Не удалось удалить услугу:', err)
  }
}

const openClientDialog = (client) => {
  selectedClient.value = {...client}
  showClientsDetails.value = true
}

const openServiceDialog = (service) => {
  selectedService.value = {...service}
  showServiceDetails.value = true
}

const openCategoryDialog = () => {
  if (selectedServiceCategory.value) {
    showCategoryDetails.value = true
  } else {
    $q.notify({ type: 'info', message: 'Сначала выберите категорию', position: "top", timeout: 1000 })
  }
}

const editClient = async () => {
  try {
    await clientsStore.update(selectedClient.value.id, { name: selectedClient.value.name, phone: selectedClient.value.phone })
    editClientMode.value = false
    showClientsDetails.value = false
    $q.notify({ type: 'positive', message: 'Клиент изменен', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка редактирования клиента', position: "top", timeout: 1000 })
    logger.error('[Catalog] Не удалось изменить клиента:', err)
  }
}

const editCategory = async () => {
  try {
    await categoriesStore.update(selectedServiceCategory.value.id, { category_name: selectedServiceCategory.value.category_name })
    editCategoryMode.value = false
    showCategoryDetails.value = false
    $q.notify({ type: 'positive', message: 'Категория изменена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка редактирования категории', position: "top", timeout: 1000 })
    logger.error('[Catalog] Не удалось изменить категорию:', err)
  }
}

const editService = async () => {
  try {
    await servicesStore.update(selectedService.value.id, { service: selectedService.value.service, price: selectedService.value.price })
    editServiceMode.value = false
    showServiceDetails.value = false
    $q.notify({ type: 'positive', message: 'Услуга изменена', position: "top", timeout: 1000 })
  } catch (err){
    $q.notify({ type: 'negative', message: 'Ошибка изменения услуги', position: "top", timeout: 1000 })
    logger.error('[Catalog] Не удалось изменить услугу:', err)
  }
}

const openNewClientDialog = () => {
  newClientDialog.value.open()
}

const openNewServiceDialog = () => {
  if (selectedServiceCategory.value) {
    newServiceDialog.value.open(selectedServiceCategory.value)
  } else {
    $q.notify({ type: 'info', message: 'Сначала выберите категорию', position: "top", timeout: 1000 })
  }
}

const openNewServiceCategoryDialog = () => {
  newServiceCategoryDialog.value.open()
}

</script>

<template>
  <q-page class="lc-page lc-shell">
    <LcPageHeader :title="t('catalog')" icon="folder_open" />

    <q-card flat class="lc-card">
      <q-tabs
        v-model="tab"
        dense
        no-caps
        active-color="secondary"
        indicator-color="secondary"
        align="justify"
        narrow-indicator
      >
        <q-tab name="services" :label="t('service')" icon="build" />
        <q-tab name="clients" :label="t('client')" icon="people" />
      </q-tabs>

      <q-separator dark />

      <q-tab-panels v-model="tab" animated class="bg-transparent">
        <q-tab-panel name="services" class="q-pa-none">
          <!-- Старт каталога из шаблона (10.4) убран: профиль создаётся из пресета и сразу
               получает готовый каталог (Фаза 12, 12.1), повторное применение пресета —
               легаси-путь. Осталась ссылка в управление профилями, где ниша и создаётся. -->
          <div class="row items-center lc-pad q-gutter-x-sm">
            <q-btn
              flat
              no-caps
              size="sm"
              color="grey-5"
              icon="tune"
              label="Управление профилями"
              @click="router.push('/other')"
            />
          </div>

          <div class="row items-center no-wrap lc-pad-x q-pb-md q-gutter-x-sm">
            <q-select
              v-model="selectedServiceCategory"
              :options="categoriesStore.items"
              option-label="category_name"
              :label="`категория: ${t('service')}`"
              dense
              outlined
              clearable
              color="secondary"
              class="col"
            />
            <q-btn flat round dense icon="create_new_folder" color="secondary" @click="openNewServiceCategoryDialog">
              <q-tooltip class="text-caption">новая категория</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              icon="edit"
              color="secondary"
              :disable="!selectedServiceCategory"
              @click="openCategoryDialog"
            >
              <q-tooltip class="text-caption">переименовать категорию</q-tooltip>
            </q-btn>
          </div>

          <div class="lc-linerow lc-linerow--head">
            <div class="lc-col-name">{{ t('service') }}</div>
            <div class="lc-col-num">цена</div>
            <div class="lc-col-del"></div>
          </div>

          <LcEmptyState
            v-if="!servicesStore.items.length"
            icon="build"
            :title="selectedServiceCategory ? `В категории пока нет: ${t('service')}` : 'Выберите категорию'"
            :hint="
              selectedServiceCategory
                ? 'Добавьте первую кнопкой «+» внизу.'
                : 'Или подтяните готовый каталог шаблоном выше.'
            "
          />

          <div
            v-for="service in servicesStore.items"
            :key="service.id"
            class="lc-linerow cursor-pointer"
            @click="openServiceDialog(service)"
          >
            <div class="lc-col-name ellipsis">{{ service.service }}</div>
            <div class="lc-col-num lc-money">{{ service.price }} р</div>
            <div class="lc-col-del"><q-icon name="chevron_right" class="lc-mute" size="18px" /></div>
          </div>
        </q-tab-panel>

        <q-tab-panel name="clients" class="q-pa-none">
          <div class="lc-linerow lc-linerow--head">
            <div class="lc-col-name">{{ t('client') }}</div>
            <div class="lc-col-num">телефон</div>
            <div class="lc-col-del"></div>
          </div>

          <LcEmptyState
            v-if="!clientsStore.items.length"
            icon="people"
            title="Клиентов пока нет"
            hint="Добавьте первого кнопкой «+» внизу."
          />

          <div
            v-for="client in clientsStore.items"
            :key="client.id"
            class="lc-linerow cursor-pointer"
            @click="openClientDialog(client)"
          >
            <div class="lc-col-name ellipsis">{{ client.name }}</div>
            <div class="lc-col-num lc-muted">{{ client.phone || '—' }}</div>
            <div class="lc-col-del"><q-icon name="chevron_right" class="lc-mute" size="18px" /></div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <LcFab
      icon="add"
      :label="fabLabel()"
      @click="tab === 'clients' ? openNewClientDialog() : openNewServiceDialog()"
    />
  <!-- Карточки выбранных записей: просмотр → правка → удаление.
       ⚠️ Диалоги живут **внутри** `q-page`, а не рядом с ним: у страницы обязан быть
       один корневой элемент — каркас анимирует её через `<Transition>` (`docs/UI.md` §4).
       У фрагмент-корня своего элемента нет: при уходе со страницы Vue вешает leave-классы
       на якорный текстовый узел (у него нет `classList`) — приложение падает.
       Живой прогон 17.09.2026: «после каталога чёрный экран и всё ни туда ни сюда». -->
  <LcDialogShell
    v-model="showClientsDetails"
    :title="editClientMode ? 'Клиент — правка' : 'Клиент'"
    confirm-label="Сохранить"
    @confirm="editClient"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="selectedClient.name" label="Имя клиента" outlined dense :disable="!editClientMode" />
      <q-input v-model="selectedClient.phone" label="Телефон" type="tel" outlined dense :disable="!editClientMode" />
    </div>

    <template #actions>
      <q-btn
        v-if="!editClientMode"
        flat
        no-caps
        color="negative"
        icon="delete"
        label="Удалить"
        @click="handleDelete"
      />
      <q-space />
      <q-btn
        flat
        no-caps
        color="grey-5"
        :label="editClientMode ? 'Отмена' : 'Закрыть'"
        @click="editClientMode ? (editClientMode = false) : (showClientsDetails = false)"
      />
      <q-btn
        v-if="!editClientMode"
        flat
        no-caps
        color="secondary"
        icon="edit"
        label="Редактировать"
        @click="editClientMode = true"
      />
      <q-btn
        v-if="editClientMode"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        label="Сохранить"
        @click="editClient"
      />
    </template>
  </LcDialogShell>

  <LcDialogShell
    v-model="showCategoryDetails"
    :title="editCategoryMode ? 'Категория — правка' : 'Категория'"
    confirm-label="Сохранить"
    @confirm="editCategory"
  >
    <q-input
      v-model="selectedServiceCategory.category_name"
      label="Название категории"
      outlined
      dense
      :disable="!editCategoryMode"
    />

    <template #actions>
      <q-btn
        v-if="!editCategoryMode"
        flat
        no-caps
        color="negative"
        icon="delete"
        label="Удалить"
        @click="handleDelete"
      />
      <q-space />
      <q-btn
        flat
        no-caps
        color="grey-5"
        :label="editCategoryMode ? 'Отмена' : 'Закрыть'"
        @click="editCategoryMode ? (editCategoryMode = false) : (showCategoryDetails = false)"
      />
      <q-btn
        v-if="!editCategoryMode"
        flat
        no-caps
        color="secondary"
        icon="edit"
        label="Редактировать"
        @click="editCategoryMode = true"
      />
      <q-btn
        v-if="editCategoryMode"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        label="Сохранить"
        @click="editCategory"
      />
    </template>
  </LcDialogShell>

  <LcDialogShell
    v-model="showServiceDetails"
    :title="editServiceMode ? `${t('service')} — правка` : t('service')"
    confirm-label="Сохранить"
    @confirm="editService"
  >
    <div class="q-gutter-y-md">
      <q-input
        v-model="selectedService.service"
        label="Название"
        outlined
        dense
        :disable="!editServiceMode"
      />
      <q-input
        v-model="selectedService.price"
        label="Цена, р"
        type="number"
        outlined
        dense
        :disable="!editServiceMode"
      />
    </div>

    <template #actions>
      <q-btn
        v-if="!editServiceMode"
        flat
        no-caps
        color="negative"
        icon="delete"
        label="Удалить"
        @click="handleDelete"
      />
      <q-space />
      <q-btn
        flat
        no-caps
        color="grey-5"
        :label="editServiceMode ? 'Отмена' : 'Закрыть'"
        @click="editServiceMode ? (editServiceMode = false) : (showServiceDetails = false)"
      />
      <q-btn
        v-if="!editServiceMode"
        flat
        no-caps
        color="secondary"
        icon="edit"
        label="Редактировать"
        @click="editServiceMode = true"
      />
      <q-btn
        v-if="editServiceMode"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        label="Сохранить"
        @click="editService"
      />
    </template>
  </LcDialogShell>

  <DeleteConfirmPage ref="confirmDialog" />
  <NewClientDialogPage ref="newClientDialog" />
  <NewServiceDialogPage ref="newServiceDialog" />
  <NewServiceCategoryDialogPage ref="newServiceCategoryDialog" />
  </q-page>
</template>

<style scoped>
.fab {
  position: absolute;
  bottom: 16px;
  right: 16px;
}
</style>
