<script setup>
// Редактируемый список позиций заказа «товары» (правка владельца 29.09.2026).
// Строки — черновик заказа: правки уезжают в БД при сохранении заказа
// (`useOrderDraftStore.updateOrder`), поэтому компонент ничего не пишет сам.
//
// Строка помнит источник: события уходят как `{ source, index, field, value }`, а стор
// адресует их к товару со склада или к разовой покупке (решение D2). Модель не меняется.
// Заголовок колонки — из лексикона (`t('part')`): слово «товар» одно на все ниши.
//
// Себестоимость и маржу из карточки заказа убрали (правка владельца 15.09.2026).
// Количество — целое ≥ 1 (задача 14.19) и выбирается из списка (`LcQuantitySelect`).
import LcQuantitySelect from 'src/components/ui/LcQuantitySelect.vue'
import { normalizeQuantity } from 'src/utils/quantity.js'
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  /** Единый список: `{ source: 'store' | 'purchase', index, ...line }`. */
  parts: { type: Array, default: () => [] },
})

const emit = defineEmits(['remove', 'update-line'])

const num = value => Number(value || 0)

/** Количество строки: целое ≥ 1 (пустое поле ввода считается единицей). */
const qty = line => normalizeQuantity(line?.amount ?? line?.quantity)

/** Источник строки: `store` — со склада, всё остальное — покупка вне склада. */
const isStore = part => part.source === 'store'
const sourceTitle = part => (isStore(part) ? 'со склада' : 'покупка (вне склада)')
</script>

<template>
  <div>
    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-src"></div>
      <div class="lc-col-name">{{ t('part') }}</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-qty">кол-во</div>
      <div class="lc-col-num">сумма</div>
      <div class="lc-col-del"></div>
    </div>

    <div v-if="!props.parts.length" class="text-caption lc-mute lc-pad">
      нет товаров — добавьте кнопкой «+»
    </div>

    <div
      v-for="part in props.parts"
      :key="`${part.source}-${part.id ?? part.index}`"
      class="lc-linerow lc-linerow--edit"
    >
      <div class="lc-col-src">
        <q-icon
          :name="isStore(part) ? 'inventory_2' : 'shopping_bag'"
          :color="isStore(part) ? 'secondary' : 'grey-6'"
          size="16px"
        >
          <q-tooltip class="text-caption">{{ sourceTitle(part) }}</q-tooltip>
        </q-icon>
      </div>

      <div class="lc-col-name">
        <q-input
          dense
          outlined
          :model-value="part.name"
          placeholder="название"
          @update:model-value="
            value =>
              emit('update-line', { source: part.source, index: part.index, field: 'name', value })
          "
        />
      </div>

      <div class="lc-col-num">
        <q-input
          dense
          outlined
          type="number"
          input-class="text-right"
          :model-value="part.price"
          @update:model-value="
            value =>
              emit('update-line', { source: part.source, index: part.index, field: 'price', value })
          "
        />
      </div>

      <div class="lc-col-qty">
        <LcQuantitySelect
          :model-value="part.amount ?? part.quantity"
          label="количество"
          @update:model-value="
            value =>
              emit('update-line', {
                source: part.source,
                index: part.index,
                field: 'amount',
                value,
              })
          "
        />
      </div>

      <div class="lc-col-num lc-money">
        {{ num(part.price) * qty(part) }}
      </div>

      <div class="lc-col-del">
        <q-btn
          flat
          round
          dense
          icon="close"
          color="negative"
          @click="emit('remove', { source: part.source, index: part.index })"
        >
          <q-tooltip class="text-caption">убрать</q-tooltip>
        </q-btn>
      </div>
    </div>
  </div>
</template>
