<script setup>
import { ref } from 'vue'
import { useProductsStore } from 'stores/useProductsStore.js'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import ArrivalProductDialogPage from 'pages/dialogs/ArrivalProductDialogPage.vue'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'

const productsStore = useProductsStore()

const deleteConfirmPage = ref(null)
const arrivalConfirmPage = ref(null)

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

  showDialog.value = true
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
      await productsStore.add(productData)
    } else {
      await productsStore.update(currentProduct.value.id, productData)
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
</template>

<style scoped></style>
