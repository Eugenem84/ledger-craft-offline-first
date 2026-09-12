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
import LcFab from 'src/components/ui/LcFab.vue'
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
import { shareLinkErrorView } from 'src/utils/shareLinkError.js'
// Фаза 10: лексикон профиля (10.1) и видимость блока идентификатора объекта (10.9).
import { useLexicon } from 'src/domain/lexicon.js'
import { useFeatures } from 'src/domain/features.js'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const draft = useOrderDraftStore()
const { t } = useLexicon()
const { isEnabled } = useFeatures()

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
  equipmentIdentifier,
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

// Добавлять позиции можно и в режиме просмотра: первое же действие включает правку.
// Так «+» работает всегда, а данные всё равно уезжают в БД только по «Сохранить».
function ensureEditMode() {
  if (!draft.editMode) draft.editMode = true
}

function openServiceDialog() {
  ensureEditMode()
  showServiceDialog.value = true
}

function openMaterialDialog() {
  ensureEditMode()
  showMaterialDialog.value = true
}

function openStoreProductDialog() {
  ensureEditMode()
  showStoreProductDialog.value = true
}

function addServiceToOrder(service) {
  ensureEditMode()
  draft.addService(service)
}

onMounted(async () => {
  try {
    await draft.init({ create: isCreateRoute.value })

    // Новый заказ начинаем сразу с выбора работ: пустая форма не должна выглядеть
    // «без возможности добавить» (вкладка существует только в режиме правки).
    if (isCreateRoute.value && draft.editMode) {
      tab.value = 'servicesChoice'
    }
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
  // Ссылку выдаёт сервер (задача 9.4): причину неудачи («не синхронизирован»,
  // «нет интернета», «нужен вход», «не найден») объясняет чистая функция,
  // поэтому здесь только показ уведомления — без «угадывания» по статусу.
  isLoading.value = true
  try {
    const url = await draft.generateShareLink()
    await navigator.clipboard.writeText(url)
    notify('positive', 'Ссылка скопирована')
  } catch (err) {
    console.error('[OrderDetails] Не удалось создать share-ссылку:', err)
    const view = shareLinkErrorView(err)
    notify(view.level, view.message)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="lc-page lc-shell">
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

        <div class="lc-card q-pa-md q-mt-sm">
          <OrderPartySelectors
            v-model:client="client"
            v-model:model="model"
            :edit-mode="editMode"
            :clients="draft.clients"
            :models="draft.models"
            :show-model="isEnabled('models')"
            @add-client="showClientDialog = true"
            @add-model="showModelDialog = true"
          />
        </div>

        <q-card flat class="lc-card q-mt-md">
          <q-tabs
            v-model="tab"
            dense
            no-caps
            active-color="secondary"
            indicator-color="secondary"
            align="justify"
            narrow-indicator
          >
            <q-tab
              name="all"
              icon="list_alt"
              :label="`обзор · ${(materials?.length || 0) + (products?.length || 0)}`"
            />
            <!-- Вкладки видны всегда: разделы «работа»/«материалы» не должны
                 исчезать в режиме просмотра (правку включает первое же действие). -->
            <q-tab name="servicesChoice" icon="build" :label="t('service')" />
            <q-tab name="materialsChoice" icon="inventory_2" label="материалы" />
          </q-tabs>

          <q-separator dark />

          <q-tab-panels v-model="tab" animated class="bg-transparent">
            <OrderOverviewPanel
              v-model:comments="comments"
              :services="services"
              :materials="materials"
              :products="products"
              :edit-mode="editMode"
              :services-total="servicesTotal"
              :materials-total="materialsTotal"
              :products-total="productsTotal"
              :cost-total="draft.costTotal"
              :margin="draft.margin"
              :markup-percent="draft.markupPercent"
              :has-unknown-cost="draft.hasUnknownCost"
              :equipment-identifier="equipmentIdentifier"
              :equipment-label="t('equipmentIdentifier')"
              :show-equipment-identifier="isEnabled('equipmentIdentifier')"
              @update:equipment-identifier="draft.equipmentIdentifier = $event"
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
              @add="addServiceToOrder($event)"
              @create="openServiceDialog"
            />

            <OrderMaterialsPanel
              :materials="materials"
              :products="products"
              :materials-total="materialsTotal"
              :products-total="productsTotal"
              :edit-mode="editMode"
              @remove-material="draft.removeMaterial($event)"
              @remove-product="draft.removeProduct($event)"
              @update-material-line="
                ({ index, field, value }) => draft.updateMaterialLine(index, field, value)
              "
              @update-product-line="
                ({ index, field, value }) => draft.updateProductLine(index, field, value)
              "
              @create-material="openMaterialDialog"
              @add-store-product="openStoreProductDialog"
            />
          </q-tab-panels>
        </q-card>

        <!-- Нижнее основное действие: всегда видно, куда нажать, чтобы добавить позицию. -->
        <LcFab
          v-if="tab === 'servicesChoice'"
          icon="add"
          :label="`Новая ${t('service')}`"
          @click="openServiceDialog"
        />
        <LcFab
          v-else-if="tab === 'materialsChoice'"
          icon="add"
          label="Новый материал"
          @click="openMaterialDialog"
        />
      </q-page>
    </q-page-container>
  </q-layout>

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
