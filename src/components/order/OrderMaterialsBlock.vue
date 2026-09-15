<script setup>
// Список ручных позиций заказа «материалы» — режим просмотра (Фаза 8, задача 8.1).
// Редактируемая версия — `OrderMaterialsEditor.vue` (вкладка «материалы»).
//
// Себестоимость и маржу из карточки заказа убрали (правка владельца 15.09.2026):
// в ордере — состав и сумма, маржа живёт в «Аналитике». Данные `buy_price` при этом
// продолжают синкаться, просто здесь не показываются.
// Количество — целое ≥ 1 (задача 14.19): «−3 шт» или «2.5 колеса» в заказе быть не может.
import { normalizeQuantity } from 'src/utils/quantity.js'

const props = defineProps({
  materials: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
  /**
   * Показывать подсказку «материалов пока нет». Родитель выключает её, когда в ордере
   * есть товары со склада (правка владельца 15.09.2026): надпись о пустых материалах
   * рядом с заполненным списком товаров только сбивала с толку.
   */
  showEmpty: { type: Boolean, default: true },
})

const emit = defineEmits(['remove'])

const num = value => Number(value || 0)

/** Количество строки для чтения: целое ≥ 1. */
const qty = line => normalizeQuantity(line?.amount)
</script>

<template>
  <div>
    <div v-if="props.showEmpty && !props.materials.length" class="text-caption lc-mute lc-pad">
      материалов пока нет — добавьте их на вкладке «материалы»
    </div>

    <template v-else>
      <div class="lc-linerow lc-linerow--head">
        <div class="lc-col-name">материал</div>
        <div class="lc-col-num">цена</div>
        <div class="lc-col-qty">кол-во</div>
        <div class="lc-col-num">сумма</div>
        <div v-if="props.editMode" class="lc-col-del"></div>
      </div>

      <div
        v-for="(material, index) in props.materials"
        :key="material.id ?? index"
        class="lc-linerow"
      >
        <div class="lc-col-name ellipsis">{{ material.name }}</div>
        <div class="lc-col-num lc-money">{{ material.price }} р</div>
        <div class="lc-col-qty">× {{ qty(material) }}</div>
        <div class="lc-col-num lc-money">{{ num(material.price) * qty(material) }} р</div>
        <div v-if="props.editMode" class="lc-col-del">
          <q-btn
            flat
            round
            dense
            icon="close"
            color="negative"
            @click="emit('remove', index)"
          >
            <q-tooltip class="text-caption">убрать</q-tooltip>
          </q-btn>
        </div>
      </div>
    </template>
  </div>
</template>
