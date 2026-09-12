<script setup>
// Список ручных позиций заказа «материалы» — режим просмотра (Фаза 8, задача 8.1).
// Редактируемая версия — `OrderMaterialsEditor.vue` (вкладка «материалы»).
//
// Показываем и маржу по строке (задачи 9.5/9.6): `—`, если закупка не указана —
// цифра «вся выручка» была бы неправдой.
const props = defineProps({
  materials: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove'])

const num = value => Number(value || 0)

const lineMargin = line =>
  line?.buy_price == null ? null : (num(line.price) - num(line.buy_price)) * num(line.amount)
</script>

<template>
  <div>
    <div v-if="!props.materials.length" class="text-caption lc-mute q-pa-md">
      материалов пока нет — добавьте их на вкладке «материалы»
    </div>

    <template v-else>
      <div class="lc-linerow lc-linerow--head">
        <div class="lc-col-name">материал</div>
        <div class="lc-col-num">цена</div>
        <div class="lc-col-qty">кол-во</div>
        <div class="lc-col-num">закупка</div>
        <div class="lc-col-num">сумма</div>
        <div class="lc-col-num">маржа</div>
        <div v-if="props.editMode" class="lc-col-del"></div>
      </div>

      <div
        v-for="(material, index) in props.materials"
        :key="material.id ?? index"
        class="lc-linerow"
      >
        <div class="lc-col-name ellipsis">{{ material.name }}</div>
        <div class="lc-col-num lc-money">{{ material.price }} р</div>
        <div class="lc-col-qty">× {{ material.amount }}</div>
        <div class="lc-col-num lc-mute">{{ material.buy_price ?? '—' }}</div>
        <div class="lc-col-num lc-money">{{ num(material.price) * num(material.amount) }} р</div>
        <div
          class="lc-col-num"
          :class="lineMargin(material) == null ? 'lc-mute' : 'text-positive'"
        >
          {{ lineMargin(material) == null ? '—' : `${lineMargin(material)} р` }}
        </div>
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
