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
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import LcQuantityStepper from 'src/components/ui/LcQuantityStepper.vue'

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
  // Количество по умолчанию — 1: шагомер сразу в рабочем положении, а не «пусто»
  // (правка владельца 15.09.2026: количество задают стрелками влево/вправо).
  arrivalQuantity.value = 1
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
  <LcDialogShell
    :model-value="showDialog"
    title="Поступление товара"
    :subtitle="currentProduct?.name"
    confirm-label="Сохранить"
    :loading="saving"
    @update:model-value="showDialog = $event"
    @confirm="makeArrivalProduct"
  >
    <div class="q-gutter-y-md">
      <div class="row q-col-gutter-md">
        <div class="col">
          <q-input
            v-model="byPrice"
            outlined
            dense
            type="number"
            label="Цена закупки, р"
            placeholder="за 1 шт."
            autofocus
          />
        </div>
        <div class="col">
          <div class="text-caption lc-mute q-mb-xs">Количество</div>
          <LcQuantityStepper v-model="arrivalQuantity" label="Количество" />
        </div>
      </div>

      <q-input
        v-model="baseSalePrice"
        outlined
        dense
        type="number"
        label="Цена продажи, р"
        hint="Если изменить — товар на складе продаётся по новой цене"
      />
    </div>
  </LcDialogShell>
</template>

<style scoped></style>
