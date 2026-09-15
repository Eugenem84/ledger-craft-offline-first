<script setup>
// Список выбранных работ в заказе (Фаза 8, задача 8.1).
// Подпись «работа/услуга» — из лексикона профиля (10.1).
//
// Задача 14.19: строка показывает количество («× 4» — «подкачать колесо» на четыре
// колеса) и сумму строки; в режиме правки количество редактируется прямо здесь —
// так же, как у материалов и товаров. Количество всегда целое ≥ 1.
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
        <div class="lc-col-name ellipsis">{{ service.service }}</div>
        <div class="lc-col-num lc-money">{{ service.price }} р</div>

        <div class="lc-col-qty">
          <q-input
            v-if="props.editMode"
            dense
            outlined
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            input-class="text-center"
            :model-value="service.quantity ?? 1"
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
