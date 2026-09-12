<script setup>
// Поступление товара (задача 9.2).
//
// Было: прямой `POST /arrival_product` через `boot/axios.js` с фиктивным `baseURL` —
// офлайн приход не работал вовсе, а на сервере повтор удваивал остаток. Стало: всё
// идёт через стор → репозиторий: приход, закупочная цена и остаток пишутся в
// локальную БД, а на сервер уезжает очередь синка (`useProductsStore.receiveArrival`).
import { logger } from 'src/utils/logger'
import { ref } from 'vue'
import { useQuasar } from 'quasar'
import { useProductsStore } from 'stores/useProductsStore.js'

const $q = useQuasar()
const productsStore = useProductsStore()

const emit = defineEmits(['product-arrival-saved'])

const currentProduct = ref(null)
const showDialog = ref(false)
const saving = ref(false)

const byPrice = ref(null)
const arrivalQuantity = ref(null)
const baseSalePrice = ref(null)

const open = (product) => {
  logger.log('открытие диалогового окна поступления товара')
  currentProduct.value = product ? { ...product } : null
  baseSalePrice.value = product?.base_sale_price ?? ''
  byPrice.value = ''
  arrivalQuantity.value = ''
  showDialog.value = true
}

const makeArrivalProduct = async () => {
  if (!currentProduct.value) return

  saving.value = true

  try {
    const result = await productsStore.receiveArrival({
      product: currentProduct.value,
      byPrice: byPrice.value,
      arrivalQuantity: arrivalQuantity.value,
      baseSalePrice: baseSalePrice.value,
    })

    showDialog.value = false
    emit('product-arrival-saved', result)

    // Офлайн-первый подход: подсказка «сохранено, остаток N» — это обратная связь
    // о том, что приход лёг в локальную БД и уедет при первой возможности.
    $q.notify({
      type: 'positive',
      message: `Приход сохранён: +${result.quantity}, остаток ${result.stockQuantity}`,
      caption: 'уедет на сервер автоматически',
      position: 'top',
      timeout: 2500,
    })
  } catch (err) {
    console.error('Ошибка прихода товара:', err)
    $q.notify({ type: 'negative', message: err.message, position: 'top' })
  } finally {
    saving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <q-dialog v-model="showDialog" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="row items-center">
        <span class="q-ml-sm text-h6">Поступление</span>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input
            v-model="byPrice"
            outlined
            type="number"
            label="цена закупки"
            placeholder="введите цену закупки"
            class="q-mb-md"
          />
        </div>
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input
            v-model="baseSalePrice"
            outlined
            type="number"
            label="цена продажи"
            placeholder="Введите цену продажи"
            class="q-mb-md"
          />
        </div>
      </q-card-section>

      <q-card-section>
        <div class="q-gutter-y-md">
          <q-input
            v-model="arrivalQuantity"
            outlined
            type="number"
            label="количество поступило"
            placeholder="Введите количество поступления"
            class="q-mb-md"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Отмена" color="yellow" v-close-popup />

        <q-btn
          label="Сохранить"
          text-color="yellow"
          :loading="saving"
          @click="makeArrivalProduct"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped></style>
