<script setup>
import {ref} from 'vue'
import {api} from 'boot/axios.js'
import DeleteConfirmPage from "pages/DeleteConfirmPage.vue";

const deleteConfirmPage = ref(null)

const emit = defineEmits(['product-arrival-saved'])

const currentProduct = ref(null)

const showDialog = ref(false)

const name = ref(null)

const byPrice = ref(null)
const arrivalQuantity = ref(null)

const baseSalePrice = ref(null)

const open = (product) => {
  console.log('открытие диалогового окна поступления товара')
  currentProduct.value = product ? {...product} : null
  name.value = product?.name || ''
  baseSalePrice.value = product?.base_sale_price || ''
  showDialog.value = true
  console.log('product: ', product)
}

const makeArrivalProduct = async () => {
  try {
    //console.log('currentCategoryId: ', currentCategory.value.id)
    if (currentProduct.value){
      console.log('запрос на поступление товара')
      await api.post(`/arrival_product`, {
        product_id: currentProduct.value.id,
        base_sale_price: baseSalePrice.value,
        by_price: byPrice.value,
        arrival_quantity: arrivalQuantity.value
      })
      showDialog.value = false
      emit('product-category-saved')
    } else {
      console.log('currentProduct: ', currentProduct.value)
    }
  } catch (err){
    console.error(err)
    currentProduct.value = null
    close()
  }
}

defineExpose({open})

</script>

<template>

  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center">
        <span class="q-ml-sm text-h6">
          Поступление
        </span>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input v-model="byPrice"
                   outlined
                   label="цена закупки"
                   placeholder="введите цену закупки"
                   class="q-mb-md"
          />
        </div>
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input v-model="baseSalePrice"
                   outlined
                   label="цена продажи"
                   placeholder="Введите цену продажи"
                   class="q-mb-md"
          />
        </div>
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input v-model="arrivalQuantity"
                   outlined
                   label="количество поступило"
                   placeholder="Введите количество поступления"
                   class="q-mb-md"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">

        <q-btn flat
               label="Отмена"
               color="yellow"
               v-close-popup
        />

        <q-btn label="Сохранить"
               text-color="yellow"
               @click="makeArrivalProduct"
        />

      </q-card-actions>


    </q-card>
  </q-dialog>

  <DeleteConfirmPage ref="deleteConfirmPage" />

</template>

<style scoped>

</style>
