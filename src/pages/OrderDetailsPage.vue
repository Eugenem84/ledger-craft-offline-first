<script setup>
// Страница деталей заказа (Фаза 8, задача 8.1). До рефакторинга — файл на 1000+ строк,
// который сам ходил в репозитории и держал всю форму. Теперь здесь только «клей»:
// инициализация через `useOrderDraftStore`, уведомления Quasar, навигация и диалоги.
//
// ⚠️ Критерий 8.2: в этом файле (и вообще в `*.vue`) нет ни одного вызова `*Repo`.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { storeToRefs } from 'pinia'

import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import OrderClientDialog from 'src/components/order/dialogs/OrderClientDialog.vue'
import OrderHeaderActions from 'src/components/order/OrderHeaderActions.vue'
import OrderMaterialDialog from 'src/components/order/dialogs/OrderMaterialDialog.vue'
import OrderMaterialsPanel from 'src/components/order/OrderMaterialsPanel.vue'
import OrderModelDialog from 'src/components/order/dialogs/OrderModelDialog.vue'
import OrderOverviewPanel from 'src/components/order/OrderOverviewPanel.vue'
import OrderPartySelectors from 'src/components/order/OrderPartySelectors.vue'
import OrderServiceDialog from 'src/components/order/dialogs/OrderServiceDialog.vue'
import OrderServicesPanel from 'src/components/order/OrderServicesPanel.vue'
import OrderStoreProductDialog from 'src/components/order/dialogs/OrderStoreProductDialog.vue'
import { useOrderDraftStore } from 'src/stores/useOrderDraftStore.js'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const draft = useOrderDraftStore()

const {
  client,
  model,
  comments,
  status,
  paid,
  editMode,
  isNewOrder,
  orderNumber,
  services,
  materials,
  products,
  servicesByCategory,
  selectedServiceCategory,
  servicesTotal,
  materialsTotal,
  productsTotal,
} = storeToRefs(draft)

const isCreateRoute = computed(() => route.name === 'new-order' || route.path === '/orders/new')
const isLoading = ref(false)
const tab = ref('all')

const showMaterialDialog = ref(false)
const showServiceDialog = ref(false)
const showClientDialog = ref(false)
const showModelDialog = ref(false)
const showStoreProductDialog = ref(false)
const deleteConfirmPage = ref(null)

const notify = (type, message) => $q.notify({ type, message })

onMounted(async () => {
  try {
    await draft.init({ create: isCreateRoute.value })
  } catch (err) {
    console.error(err)
    notify('negative', 'Ошибка загрузки заказа')
  }
})

// --- Справочники вкладок ---

const handleServiceCategoryChange = async categoryId => {
  try {
    await draft.loadServicesByCategory(categoryId)
  } catch (err) {
    console.error(err)
    notify('negative', 'Ошибка загрузки работ')
  }
}

const handleStoreCategoryChange = async categoryId => {
  try {
    await draft.loadProductsByCategory(categoryId)
  } catch (err) {
    console.error(err)
    notify('negative', 'Ошибка загрузки товаров')
  }
}

const handleAddMaterial = payload => {
  draft.addMaterial(payload)
  showMaterialDialog.value = false
}

const handleMaterialInvalid = () => notify('warning', 'Введите корректные данные')

const handleAddService = async payload => {
  try {
    await draft.addServiceToCatalog(payload)
    notify('positive', 'Работа добавлена')
    showServiceDialog.value = false
  } catch (err) {
    console.error(err)
    notify('negative', 'Ошибка добавления работы')
  }
}

const handleAddClient = async payload => {
  try {
    await draft.addClient(payload)
    notify('positive', 'Клиент добавлен')
    showClientDialog.value = false
  } catch (err) {
    console.error(err)
    notify('negative', 'Ошибка добавления клиента')
  }
}

const handleAddModel = async payload => {
  try {
    await draft.addModel(payload)
    notify('positive', 'Модель добавлена')
    showModelDialog.value = false
  } catch (err) {
    console.error(err)
    notify('negative', 'Ошибка добавления модели')
  }
}

// --- Сам заказ ---
const handleSave = async () => {
  try {
    await draft.save()
    notify('positive', 'Ордер сохранен')
    router.back()
  } catch (err) {
    console.error(err)
    notify('negative', 'Ошибка сохранения ордера')
  }
}

const handleDelete = () => {
  deleteConfirmPage.value.open(
    'Подтвердите удаление',
    `Вы уверены, что хотите удалить ордер №"${orderNumber.value}"?`,
    async () => {
      try {
        await draft.removeOrder()
        notify('positive', 'Ордер удален')
        router.back()
      } catch (err) {
        console.error(err)
        notify('negative', 'Ошибка удаления ордера')
      }
    }
  )
}

const handleShare = async () => {
  // Ссылка требует онлайн-взаимодействия: без `server_id` сервер её не выдаст (задача 9.4).
  if (!draft.order?.server_id) {
    notify('warning', 'Сначала нужно синхронизировать ордер')
    return
  }

  isLoading.value = true
  try {
    const url = await draft.generateShareLink()
    await navigator.clipboard.writeText(url)
    notify('positive', 'Ссылка скопирована')
  } catch (err) {
    console.error('Ошибка:', err)
    notify('negative', 'Ошибка копирования ссылки')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <OrderHeaderActions
    :edit-mode="editMode"
    :is-new-order="isNewOrder"
    :order-number="orderNumber"
    :status="status"
    :paid="paid"
    :busy="isLoading"
    @back="router.back()"
    @share="handleShare"
    @clear="draft.clearPositions()"
    @remove="handleDelete"
    @edit="draft.editMode = true"
    @save="handleSave"
    @update:status="draft.setStatus($event)"
    @update:paid="draft.togglePaid()"
  />

  <OrderPartySelectors
    v-model:client="client"
    v-model:model="model"
    :edit-mode="editMode"
    :clients="draft.clients"
    :models="draft.models"
    @add-client="showClientDialog = true"
    @add-model="showModelDialog = true"
  />

  <div>
    <q-card>
      <q-tabs
        v-show="editMode"
        v-model="tab"
        dense
        class="text-grey"
        active-color="yellow"
        indicator-color="yellow"
        align="justify"
        narrow-indicator
      >
        <q-tab
          name="all"
          :label="`работ: ${services?.length || 0} материалов: ${(materials?.length || 0) + (products?.length || 0)}`"
        />
        <q-tab name="servicesChoice" v-if="editMode" label="работы" />
        <q-tab name="materialsChoice" v-if="editMode" label="материалы" />
      </q-tabs>

      <q-separator />

      <q-tab-panels v-model="tab" animated>
        <OrderOverviewPanel
          v-model:comments="comments"
          :services="services"
          :materials="materials"
          :products="products"
          :edit-mode="editMode"
          :services-total="servicesTotal"
          :materials-total="materialsTotal"
          :products-total="productsTotal"
          @remove-service="draft.removeService($event)"
          @remove-material="draft.removeMaterial($event)"
          @remove-product="draft.removeProduct($event)"
        />

        <OrderServicesPanel
          :categories="draft.categories"
          :selected-category="selectedServiceCategory"
          :services="servicesByCategory"
          :chosen="services"
          @update:selected-category="handleServiceCategoryChange"
          @add="draft.addService($event)"
          @create="showServiceDialog = true"
        />

        <OrderMaterialsPanel
          :materials="materials"
          :products="products"
          :materials-total="materialsTotal"
          :products-total="productsTotal"
          @remove-material="draft.removeMaterial($event)"
          @remove-product="draft.removeProduct($event)"
          @update-material-line="({ index, field, value }) => draft.updateMaterialLine(index, field, value)"
          @update-product-line="({ index, field, value }) => draft.updateProductLine(index, field, value)"
          @create-material="showMaterialDialog = true"
          @add-store-product="showStoreProductDialog = true"
        />
      </q-tab-panels>
    </q-card>
  </div>

  <OrderMaterialDialog
    v-model="showMaterialDialog"
    @submit="handleAddMaterial"
    @invalid="handleMaterialInvalid"
  />

  <OrderServiceDialog v-model="showServiceDialog" @submit="handleAddService" />
  <OrderClientDialog v-model="showClientDialog" @submit="handleAddClient" />
  <OrderModelDialog v-model="showModelDialog" @submit="handleAddModel" />

  <OrderStoreProductDialog
    v-model="showStoreProductDialog"
    :categories="draft.productCategories"
    :products="draft.storeProducts"
    :selected-category="draft.selectedProductCategory"
    :selected-product="draft.selectedStoreProduct"
    @update:selected-category="handleStoreCategoryChange"
    @update:selected-product="draft.selectedStoreProduct = $event"
    @submit="draft.addProductFromStore()"
  />

  <DeleteConfirmPage ref="deleteConfirmPage" />
</template>

<style scoped>
.row {
  background-color: black;
}
</style>
