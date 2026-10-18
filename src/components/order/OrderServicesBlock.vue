<script setup>
// Список выбранных работ в заказе (Фаза 8, задача 8.1).
// Подпись «работа/услуга» — из лексикона профиля (10.1).
//
// Задача 14.19: строка показывает количество («× 4» — «подкачать колесо» на четыре
// колеса) и сумму строки; в режиме правки количество выбирают из списка — так же,
// как у материалов и товаров. Правка владельца (26.09.2026): стрелки «‹ N ›»
// убраны (занимали почти 100px и выдавливали название), тап по полю открывает
// список чисел. Количество всегда целое ≥ 1.
//
// Задача 14.34 (живой отчёт мастера 16.10.2026, боевой контур): «из вкладки заказа
// обзор надо чтобы была возможность редактировать стоимость работ и запчастей» — цена
// стала полем ввода в режиме правки, как у товаров и покупок («обзор» перестал быть
// экраном «только для чтения» по цене). Значение живёт в черновике и уезжает в БД по
// «Сохранить», поэтому экономика строки и итог пересчитываются сразу.
import LcQuantitySelect from 'src/components/ui/LcQuantitySelect.vue'
import { useLexicon } from 'src/domain/lexicon.js'
import { normalizeQuantity } from 'src/utils/quantity.js'

const { t } = useLexicon()

const props = defineProps({
  services: { type: Array, default: () => [] },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits(['remove', 'update-line'])

const num = value => Number(value || 0)

/** Количество строки для чтения: целое ≥ 1 (пусто/0 в поле ввода — это «1»). */
const lineQuantity = line => normalizeQuantity(line?.quantity)
</script>

<template>
  <div>
    <div v-if="!props.services.length" class="text-caption lc-mute lc-pad">
      работ пока нет — добавьте их на вкладке «{{ t('service') }}»
    </div>

    <template v-else>
      <div class="lc-linerow lc-linerow--head">
        <div class="lc-col-name">{{ t('service') }}</div>
        <div class="lc-col-num">цена</div>
        <div class="lc-col-qty">кол-во</div>
        <div class="lc-col-num">сумма</div>
        <div v-if="props.editMode" class="lc-col-del"></div>
      </div>

      <div
        v-for="(service, index) in props.services"
        :key="service.id ?? index"
        class="lc-linerow"
        :class="{ 'lc-linerow--edit': props.editMode }"
      >
        <div class="lc-col-name lc-col-name--wrap">{{ service.service }}</div>

        <!-- Цена: в правке — поле ввода (задача 14.34), в просмотре — только чтение.
             Сумма строки считается из цены и количества и обновляется сразу. -->
        <div class="lc-col-num">
          <q-input
            v-if="props.editMode"
            dense
            outlined
            type="number"
            input-class="text-right"
            :model-value="service.price"
            @update:model-value="value => emit('update-line', { index, field: 'price', value })"
          />
          <span v-else class="lc-money">{{ service.price }} р</span>
        </div>

        <div class="lc-col-qty">
          <LcQuantitySelect
            v-if="props.editMode"
            :model-value="service.quantity ?? 1"
            :label="`количество: ${t('service')}`"
            @update:model-value="
              value => emit('update-line', { index, field: 'quantity', value })
            "
          />
          <template v-else>× {{ lineQuantity(service) }}</template>
        </div>

        <div class="lc-col-num lc-money">
          {{ num(service.price) * lineQuantity(service) }} р
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
