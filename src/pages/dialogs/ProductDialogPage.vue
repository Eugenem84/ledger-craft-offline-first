<script setup>
import { ref } from 'vue'
import { useProductsStore } from 'stores/useProductsStore.js'
import DeleteConfirmPage from 'pages/dialogs/DeleteConfirmPage.vue'
import ArrivalProductDialogPage from 'pages/dialogs/ArrivalProductDialogPage.vue'

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

defineExpose({ open })
</script>

<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center">
        <span class="q-ml-sm text-h6" v-if="isNew">Новый товар</span>
        <span class="q-ml-sm text-h6" v-else-if="isEditing">Редактирование</span>
        <span class="q-ml-sm text-h6" v-else>Товар</span>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input v-model="name" outlined label="Название" :disable="!isEditing" />
          <q-input v-model="baseSalePrice" outlined label="Цена продажи" type="number" :disable="!isEditing" />
          <q-input v-model="description" outlined label="Описание" type="textarea" :disable="!isEditing" />
          <q-input v-model="manufacturer" outlined label="Производитель" :disable="!isEditing" />
          <q-input v-model="product_number" outlined label="Артикул" :disable="!isEditing" />
          <q-input v-model="weight" outlined label="Вес" type="number" :disable="!isEditing" />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-if="!isEditing && !isNew" label="Удалить" flat color="red" @click="deleteProduct" />
        <q-btn v-if="!isEditing && !isNew" label="Поступление" text-color="yellow" @click="openArrivalProductDialog" />
        <q-space v-if="!isEditing && !isNew" />

        <q-btn flat label="Закрыть" color="grey" v-close-popup />

        <q-btn v-if="!isEditing && !isNew" label="Редактировать" text-color="yellow" @click="isEditing = true" />
        <q-btn v-if="isEditing" label="Сохранить" text-color="yellow" @click="saveProduct" />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <DeleteConfirmPage ref="deleteConfirmPage" />
  <ArrivalProductDialogPage ref="arrivalConfirmPage" />
</template>

<style scoped></style>
