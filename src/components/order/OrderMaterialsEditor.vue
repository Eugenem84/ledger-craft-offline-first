<script setup>
// Редактируемый список ручных позиций (вкладка «материалы», Фаза 8, задача 8.1).
// Строки — это черновик заказа: правки уезжают в БД при сохранении заказа
// (`useOrderDraftStore.updateOrder`), поэтому компонент ничего не пишет сам.
//
// «Закупка» — себестоимость ручной позиции (задачи 9.5/9.6): для «купленного по пути»
// её вводит мастер. Пусто = «не знаю»: маржа по строке не считается (показываем «—»).
const props = defineProps({
  materials: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
})

const emit = defineEmits(['remove', 'update-line'])

const num = value => Number(value || 0)

/** Маржа строки: (цена − закупка) × количество. `null` — закупка неизвестна. */
const lineMargin = line =>
  line?.buy_price == null ? null : (num(line.price) - num(line.buy_price)) * num(line.amount)
</script>

<template>
  <div>
    <div class="lc-linerow lc-linerow--head">
      <div class="lc-col-name">материал</div>
      <div class="lc-col-num">цена</div>
      <div class="lc-col-qty">кол-во</div>
      <div class="lc-col-num">закупка</div>
      <div class="lc-col-num">сумма</div>
      <div class="lc-col-num">маржа</div>
      <div class="lc-col-del"></div>
    </div>

    <div v-if="!props.materials.length" class="text-caption lc-mute q-pa-md">
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
          input-class="text-center"
          :model-value="material.amount"
          @update:model-value="value => emit('update-line', { index, field: 'amount', value })"
        />
      </div>

      <div class="lc-col-num">
        <q-input
          dense
          outlined
          type="number"
          input-class="text-right"
          :model-value="material.buy_price"
          placeholder="—"
          @update:model-value="value => emit('update-line', { index, field: 'buy_price', value })"
        />
      </div>

      <div class="lc-col-num lc-money">
        {{ num(material.price) * num(material.amount) }}
      </div>

      <div
        class="lc-col-num lc-money"
        :class="lineMargin(material) == null ? 'lc-mute' : 'text-positive'"
      >
        {{ lineMargin(material) == null ? '—' : lineMargin(material) }}
      </div>

      <div class="lc-col-del">
        <q-btn flat round dense icon="close" color="negative" @click="emit('remove', index)">
          <q-tooltip class="text-caption">убрать</q-tooltip>
        </q-btn>
      </div>
    </div>
  </div>
</template>
