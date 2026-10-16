<script setup>
// Список позиций заказа «товары» — режим просмотра (правка владельца 29.09.2026):
// товар со склада и разовая покупка («вне склада») идут **одним списком**, а тег
// источника (иконка + подсказка) объясняет мастеру, что откуда. Заголовок колонки берётся
// из лексикона (`t('part')`) — слово «товар» одно на все ниши. Под капотом модель не
// меняется (решение D2): `products` — склад, `materials` — покупки вне склада.
//
// Себестоимость и маржу из карточки заказа убрали (правка владельца 15.09.2026):
// в ордере — состав и сумма, маржа живёт в «Аналитике». Количество — целое ≥ 1 (14.19).
//
// Задача 14.34 (живой отчёт мастера 16.10.2026, боевой контур): «из вкладки заказа
// обзор надо чтобы была возможность редактировать стоимость работ и запчастей» — в
// режиме правки цена товара/покупки становится полем ввода, как у работ рядом
// (`OrderServicesBlock`). Название и количество по-прежнему правятся на вкладке
// «товары» (`OrderPartsEditor`) — в «обзоре» меняем только стоимость, как просили.
import { normalizeQuantity } from 'src/utils/quantity.js'
import { useLexicon } from 'src/domain/lexicon.js'

const { t } = useLexicon()

const props = defineProps({
  /** Единый список: `{ source: 'store' | 'purchase', index, ...line }`. */
  parts: { type: Array, default: () => [] },
  /** Правка: цена строки редактируется (состав и порядок списка не меняются). */
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['update-line'])

const num = value => Number(value || 0)

/** Количество строки для чтения: целое ≥ 1. */
const qty = line => normalizeQuantity(line?.amount ?? line?.quantity)

/** Источник строки: `store` — со склада, всё остальное — покупка вне склада. */
const isStore = part => part.source === 'store'
const sourceTitle = part => (isStore(part) ? 'со склада' : 'покупка (вне склада)')
</script>

<template>
  <div>
    <div v-if="!props.parts.length" class="text-caption lc-mute lc-pad">
      нет товаров — добавьте кнопкой «+»
    </div>

    <template v-else>
      <div class="lc-linerow lc-linerow--head">
        <div class="lc-col-src"></div>
        <div class="lc-col-name">{{ t('part') }}</div>
        <div class="lc-col-num">цена</div>
        <div class="lc-col-qty">кол-во</div>
        <div class="lc-col-num">сумма</div>
      </div>

      <div
        v-for="part in props.parts"
        :key="`${part.source}-${part.id ?? part.index}`"
        class="lc-linerow"
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
        <div class="lc-col-name ellipsis">{{ part.name }}</div>

        <!-- Цена: в правке — поле ввода (задача 14.34), в просмотре — только чтение.
             Источник строки (`store` / `purchase`) уходит событием в стор, чтобы правка
             попала в нужную таблицу (решение D2). -->
        <div class="lc-col-num">
          <q-input
            v-if="props.editMode"
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
          <span v-else class="lc-money">{{ part.price }} р</span>
        </div>
        <div class="lc-col-qty">× {{ qty(part) }}</div>
        <div class="lc-col-num lc-money">{{ num(part.price) * qty(part) }} р</div>
      </div>
    </template>
  </div>
</template>
