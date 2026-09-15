<script setup>
// Правка прихода (правка владельца 15.09.2026: «историю приходов тоже должна быть
// возможность редактировать»).
//
// Что можно менять — диктует сервер (`IncomingProductRepository::recordArrival()`):
//   • приход ещё **не уехал** на сервер — правим всё: количество, закупку, поставщика.
//     Остаток пересчитывается на дельту, а ожидающий INSERT в очереди переписывается
//     (`incomingProductsRepo.updateArrival`), поэтому сервер приходует новое количество;
//   • приход **уже на сервере** — количество менять нельзя: сервер увеличивает склад по
//     приходу ровно один раз и остаток не пересчитывает. Закупка и поставщик правятся
//     обычным `update` — они остаток не меняют.
//
// Сам диалог ничего не считает: значения уходят в `useProductsStore.updateArrival` одним
// патчем, а ошибка сервера/репозитория показывается уведомлением.
import { computed, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useProductsStore } from 'src/stores/useProductsStore.js'
import LcDialogShell from 'src/components/ui/LcDialogShell.vue'
import LcQuantityStepper from 'src/components/ui/LcQuantityStepper.vue'
import { formatDayLabel } from 'src/utils/formatDate.js'

const $q = useQuasar()
const productsStore = useProductsStore()

const emit = defineEmits(['saved'])

/** Открытый приход (`null` — диалог закрыт). */
const current = ref(null)
const showDialog = ref(false)
const saving = ref(false)

const quantity = ref(1)
const byPrice = ref('')
const supplier = ref('')

/** Количество правится только у прихода, который ещё не уехал на сервер. */
const quantityEditable = computed(() => !current.value?.synced)

const subtitle = computed(() => {
  const movement = current.value
  if (!movement) return ''

  const parts = [movement.productName || 'товар', formatDayLabel(movement.createdAt)]

  return parts.filter(Boolean).join(' · ')
})

/**
 * Открывает диалог на движении из истории (`stockHistoryRepo.toMovements`).
 * @param {{arrivalId: string, productName?: string, quantity?: number, price?: number,
 *   supplier?: string, synced?: boolean, createdAt?: number}} movement
 */
const open = movement => {
  if (!movement?.arrivalId) return

  current.value = { ...movement }
  quantity.value = movement.quantity ?? 1
  byPrice.value = movement.price ?? ''
  supplier.value = movement.supplier ?? ''
  showDialog.value = true
}

const save = async () => {
  if (!current.value?.arrivalId) return

  saving.value = true

  try {
    const result = await productsStore.updateArrival(current.value.arrivalId, {
      quantity: quantity.value,
      byPrice: byPrice.value,
      supplier: supplier.value,
    })

    showDialog.value = false
    emit('saved', result)

    $q.notify({
      type: 'positive',
      message: result.stockQuantity === null
        ? 'Приход обновлён'
        : `Приход обновлён, остаток: ${result.stockQuantity}`,
      position: 'top',
      timeout: 2000,
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message, position: 'top', timeout: 3000 })
  } finally {
    saving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <LcDialogShell
    :model-value="showDialog"
    title="Приход товара"
    :subtitle="subtitle"
    confirm-label="Сохранить"
    :loading="saving"
    @update:model-value="showDialog = $event"
    @confirm="save"
  >
    <div class="q-gutter-y-md">
      <div>
        <div class="text-caption lc-mute q-mb-xs">Количество</div>
        <LcQuantityStepper
          v-model="quantity"
          label="Количество прихода"
          :disable="!quantityEditable"
        />
        <div v-if="quantityEditable" class="text-caption lc-mute q-mt-xs">
          Остаток склада пересчитается на разницу — на сервер уедет новое количество.
        </div>
        <div v-else class="text-caption lc-mute q-mt-xs">
          Приход уже на сервере: количество не пересчитывается (сервер считает остаток по
          приходу один раз). Закупку и поставщика править можно.
        </div>
      </div>

      <div class="row q-col-gutter-md">
        <div class="col">
          <q-input
            v-model="byPrice"
            outlined
            dense
            type="number"
            label="Цена закупки, р"
            hint="Из неё считается маржа"
          />
        </div>
        <div class="col">
          <q-input v-model="supplier" outlined dense label="Поставщик" placeholder="не указан" />
        </div>
      </div>
    </div>
  </LcDialogShell>
</template>

<style scoped></style>
