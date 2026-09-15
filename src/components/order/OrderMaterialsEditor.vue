<script setup>
// Редактируемый список ручных позиций (вкладка «материалы», Фаза 8, задача 8.1).
// Строки — это черновик заказа: правки уезжают в БД при сохранении заказа
// (`useOrderDraftStore.updateOrder`), поэтому компонент ничего не пишет сам.
//
// Себестоимость и маржу из карточки заказа убрали (правка владельца 15.09.2026): строки
// редактируют название, цену и количество, а маржа живёт в «Аналитике». Данные `buy_price`
// при этом продолжают синкаться (`useOrderDraftStore`/репозитории не тронуты).
// Количество — целое ≥ 1 (задача 14.19): «−3» и «2.5» не существуют, хранит и отправит
// его стор/репозиторий (`utils/quantity.js`).
import { normalizeQuantity } from 'src/utils/quantity.js'

const props = defineProps({
  materials: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['remove', 'update-line'])

const num = value => Number(value || 0)

/** Количество строки: целое ≥ 1 (пустое поле ввода считается единицей). */
const qty = line => normalizeQuantity(line?.amount)
</script>

<template>
  <div>
    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">материал</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-qty">кол-во</div>
      <div class="lc-col-num">сумма</div>
      <div class="lc-col-del"></div>
    </div>

    <div v-if="!props.materials.length" class="text-caption lc-mute lc-pad">
      нет материалов — добавьте кнопкой «+»
    </div>

    <div
      v-for="(material, index) in props.materials"
      :key="material.id ?? index"
      class="lc-linerow lc-linerow--edit"
    >
      <div class="lc-col-name">
        <q-input
          dense
          outlined
          :model-value="material.name"
          placeholder="название"
          @update:model-value="value => emit('update-line', { index, field: 'name', value })"
        />
      </div>

      <div class="lc-col-num">
        <q-input
          dense
          outlined
          type="number"
          input-class="text-right"
          :model-value="material.price"
          @update:model-value="value => emit('update-line', { index, field: 'price', value })"
        />
      </div>

      <div class="lc-col-qty">
        <q-input
          dense
          outlined
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          input-class="text-center"
          :model-value="material.amount"
          @update:model-value="value => emit('update-line', { index, field: 'amount', value })"
        />
      </div>

      <div class="lc-col-num lc-money">
        {{ num(material.price) * qty(material) }}
      </div>

      <div class="lc-col-del">
        <q-btn flat round dense icon="close" color="negative" @click="emit('remove', index)">
          <q-tooltip class="text-caption">убрать</q-tooltip>
        </q-btn>
      </div>
    </div>
  </div>
</template>
