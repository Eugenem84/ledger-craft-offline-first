<script setup>
// Вкладка «товары» (правка владельца 29.09.2026): **один список** позиций заказа —
// товары со склада и разовые покупки («вне склада») — с тегом источника. Под капотом
// модель не меняется (решение D2): `products` — склад, `materials` — покупки.
//
// Ввод один: кнопка «Добавить», а источник («со склада» / «покупка вне склада») выбирает
// страница (`OrderPartSourceDialog`). Если раздел «склад» выключен флагом профиля (10.3),
// доступен только источник «покупка».
import OrderPartsBlock from 'src/components/order/OrderPartsBlock.vue'
import OrderPartsEditor from 'src/components/order/OrderPartsEditor.vue'
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  /** Единый список позиций стора: `{ source, index, ...line }`. */
  parts: { type: Array, default: () => [] },
  partsTotal: { type: Number, default: 0 },
  /** Правка: в режиме просмотра строки только читаются (вкладка видна всегда). */
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove-part', 'update-part-line', 'add'])
</script>

<template>
  <!-- Панель вкладки живёт в `OrderDetailsPage.vue` (прямой ребёнок `q-tab-panels`). -->
  <div>
    <div class="lc-pad">
      <!-- Один вход: страница спрашивает источник (склад / покупка вне склада). -->
      <q-btn
        class="full-width"
        unelevated
        no-caps
        color="secondary"
        text-color="black"
        icon="add"
        label="Добавить"
        @click="emit('add')"
      />

      <div class="text-caption lc-mute q-mt-sm">
        {{ t('parts') }}: <span class="lc-money">{{ props.partsTotal }} р</span>
      </div>
    </div>

    <!-- Правка: редактируемые строки. Просмотр: те же данные только для чтения
         (вкладка видна всегда, но менять позиции можно лишь после включения правки). -->
    <template v-if="props.editMode">
      <OrderPartsEditor
        :parts="props.parts"
        @remove="payload => emit('remove-part', payload)"
        @update-line="payload => emit('update-part-line', payload)"
      />
    </template>

    <template v-else>
      <OrderPartsBlock :parts="props.parts" />
    </template>
  </div>
</template>
