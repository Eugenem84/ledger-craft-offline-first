<script setup>
import { ref } from 'vue'
import { useProductsStore } from 'stores/useProductsStore.js'
import { useStockHistoryStore } from 'src/stores/useStockHistoryStore.js'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import ArrivalProductDialogPage from 'pages/dialogs/ArrivalProductDialogPage.vue'
import EditArrivalDialogPage from 'pages/dialogs/EditArrivalDialogPage.vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
// Строки истории склада общие со вкладкой «движение товаров» (`StockMovementsList`).
import StockMovementsList from 'src/components/store/StockMovementsList.vue'

const productsStore = useProductsStore()
// История склада (правка владельца 15.09.2026): приходы и расходы товара одной лентой.
const history = useStockHistoryStore()

const deleteConfirmPage = ref(null)
const arrivalConfirmPage = ref(null)
// Правка уже оформленного прихода (правка владельца 15.09.2026).
const editArrivalDialog = ref(null)

const emit = defineEmits(['product-saved'])

const currentProduct = ref({})
const showDialog = ref(false)
const isNew = ref(false)
const isEditing = ref(false)

// Form fields
const name = ref('')
const baseSalePrice = ref('')
const description = ref('')
const manufacturer = ref('')
const product_number = ref('')
const weight = ref('')
// Цена закупки (задачи 9.5/9.6): из неё считается маржа в «Аналитике». Раньше её
// можно было задать только приходом — товар, заведённый руками, оставался без
// себестоимости, и наценка показывалась прочерком (правка владельца 15.09.2026).
const buyPrice = ref('')

const open = (product, productCategory, isDetailView) => {
  if (product) { // Existing product
    currentProduct.value = { ...product }
    isNew.value = false
    isEditing.value = !isDetailView
  } else { // New product
    currentProduct.value = { product_category_id: productCategory.id }
    isNew.value = true
    isEditing.value = true
  }

  // Populate form fields
  name.value = currentProduct.value.name || ''
  baseSalePrice.value = currentProduct.value.base_sale_price || ''
  description.value = currentProduct.value.description || ''
  manufacturer.value = currentProduct.value.manufacturer || ''
  product_number.value = currentProduct.value.product_number || ''
  weight.value = currentProduct.value.weight || ''
  buyPrice.value = currentProduct.value.buy_price ?? ''

  // История — только у существующего товара (у нового ещё нет движений).
  if (isNew.value) {
    history.reset()
  } else {
    history.load(currentProduct.value.id)
  }

  showDialog.value = true
}

/**
 * Пишет цену закупки, если её действительно задали или изменили.
 * Пустое поле — «не знаю» (как в приходе: без цены закупка не появляется).
 *
 * @param {string} productId локальный UUID товара
 */
const saveBuyPriceIfFilled = async productId => {
  const price = Math.round(Number(buyPrice.value) || 0)

  if (!(price > 0)) return
  if (price === Number(currentProduct.value.buy_price ?? 0)) return

  await productsStore.saveBuyPrice(productId, price)
}

const saveProduct = async () => {
  try {
    const productData = {
      ...currentProduct.value,
      name: name.value,
      base_sale_price: baseSalePrice.value,
      description: description.value,
      manufacturer: manufacturer.value,
      product_number: product_number.value,
      weight: weight.value,
    }

    if (isNew.value) {
      // id задаём здесь: сразу после сохранения нужно записать и цену закупки,
      // а `productsStore.add` не возвращает созданную запись.
      const id = crypto.randomUUID()
      await productsStore.add({ ...productData, id })
      await saveBuyPriceIfFilled(id)
    } else {
      await productsStore.update(currentProduct.value.id, productData)
      await saveBuyPriceIfFilled(currentProduct.value.id)
    }

    emit('product-saved')
    showDialog.value = false
  } catch (err) {
    console.error('Ошибка сохранения товара:', err)
  }
}

const deleteProduct = async () => {
  if (!currentProduct.value?.id) return

  deleteConfirmPage.value.open(
    'Подтвердите удаление',
    `Вы уверены, что хотите удалить товар "${currentProduct.value.name}"?`,
    async () => {
      try {
        await productsStore.remove(currentProduct.value.id)
        emit('product-saved')
        showDialog.value = false
      } catch (err) {
        console.error('Ошибка удаления товара:', err)
      }
    }
  )
}

const openArrivalProductDialog = () => {
  arrivalConfirmPage.value.open(currentProduct.value)
}

/**
 * Приход сохранён офлайн (задача 9.2): просим список товаров перечитаться —
 * цена продажи могла измениться, а остаток уже лежит в локальной БД.
 */
const handleArrivalSaved = () => {
  emit('product-saved')
  // Приход — это движение склада: обновляем ленту истории, если карточка открыта.
  if (currentProduct.value?.id) history.load(currentProduct.value.id)
}

/** Открывает правку прихода из ленты истории склада (правка владельца 15.09.2026). */
const openEditArrival = movement => editArrivalDialog.value?.open(movement)

/**
 * Приход изменили: остаток мог поменяться — обновляем ленту истории и список товаров
 * на странице склада (`emit('product-saved')` → `StorePage.handleProductSaved`).
 */
const handleArrivalEdited = async () => {
  emit('product-saved')

  if (currentProduct.value?.id) await history.load(currentProduct.value.id)
}

defineExpose({ open })
</script>

<template>
  <LcDialogShell
    :model-value="showDialog"
    :title="isNew ? 'Новый товар' : isEditing ? 'Редактирование товара' : 'Товар'"
    :subtitle="isNew || isEditing ? '' : 'Просмотр карточки'"
    @update:model-value="showDialog = $event"
    @confirm="saveProduct"
  >
    <div class="q-gutter-y-md">
      <q-input v-model="name" outlined dense label="Название" :disable="!isEditing" />
      <q-input
        v-model="baseSalePrice"
        outlined
        dense
        label="Цена продажи, р"
        type="number"
        :disable="!isEditing"
      />
      <!-- Цена закупки (задачи 9.5/9.6): без неё «Аналитика» не может посчитать маржу
           и показывает наценку прочерком (правка владельца 15.09.2026). -->
      <q-input
        v-model="buyPrice"
        outlined
        dense
        label="Цена закупки, р"
        type="number"
        hint="Из неё считается маржа в «Аналитике»"
        :disable="!isEditing"
      />
      <q-input
        v-model="description"
        outlined
        dense
        label="Описание"
        type="textarea"
        autogrow
        :disable="!isEditing"
      />
      <div class="row q-col-gutter-md">
        <div class="col">
          <q-input v-model="manufacturer" outlined dense label="Производитель" :disable="!isEditing" />
        </div>
        <div class="col">
          <q-input v-model="product_number" outlined dense label="Артикул" :disable="!isEditing" />
        </div>
      </div>
      <q-input v-model="weight" outlined dense label="Вес" type="number" :disable="!isEditing" />

      <!-- История склада (правка владельца 15.09.2026): приходы «+» и расходы «−»
           товара одной лентой. Видна в просмотре карточки — там же, где «Поступление».
           Строки общие с вкладкой «движение товаров» (`StockMovementsList`), включая
           правку прихода. -->
      <div v-if="!isNew && !isEditing">
        <div class="row items-center no-wrap q-mb-xs">
          <q-icon name="swap_vert" size="18px" class="lc-mute q-mr-sm" />
          <div class="lc-eyebrow">история склада</div>
          <q-space />
          <div class="text-caption lc-mute">+{{ history.totalIn }} · −{{ history.totalOut }}</div>
        </div>

        <div class="lc-card">
          <StockMovementsList
            :movements="history.movements"
            :loading="history.loading"
            :error="history.error"
            :show-product="false"
            empty-hint="приходов и расходов пока нет — товар приходит кнопкой «Поступление»"
            @edit="openEditArrival"
          />
        </div>
      </div>
    </div>

    <template #actions>
      <q-btn
        v-if="!isEditing && !isNew"
        flat
        no-caps
        color="negative"
        icon="delete"
        label="Удалить"
        @click="deleteProduct"
      />
      <q-btn
        v-if="!isEditing && !isNew"
        flat
        no-caps
        color="secondary"
        icon="download"
        label="Поступление"
        @click="openArrivalProductDialog"
      />
      <q-space />
      <q-btn
        flat
        no-caps
        color="grey-5"
        :label="isEditing ? 'Отмена' : 'Закрыть'"
        @click="showDialog = false"
      />
      <q-btn
        v-if="!isEditing && !isNew"
        flat
        no-caps
        color="secondary"
        icon="edit"
        label="Редактировать"
        @click="isEditing = true"
      />
      <q-btn
        v-if="isEditing"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        label="Сохранить"
        @click="saveProduct"
      />
    </template>
  </LcDialogShell>

  <DeleteConfirmPage ref="deleteConfirmPage" />
  <ArrivalProductDialogPage ref="arrivalConfirmPage" @product-arrival-saved="handleArrivalSaved" />
  <EditArrivalDialogPage ref="editArrivalDialog" @saved="handleArrivalEdited" />
</template>

<style scoped></style>
