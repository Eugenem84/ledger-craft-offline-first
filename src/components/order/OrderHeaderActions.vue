<script setup>
// Шапка страницы заказа (Фаза 8, задача 8.1): кнопки действий, номер заказа,
// переключатели статуса и «оплачено». Логика — в `useOrderDraftStore`, здесь только события.
//
// Переработка UI: вместо ряда мелких подписей («НАЗАД», «РЕД», «сохр», «опл»)
//   • назад / правка / сохранение — иконки с подсказками;
//   • второстепенные действия (ссылка, очистка, удаление) — в меню «⋮»;
//   • статус и оплата — один ряд компактных сегментированных переключателей.
//
// Задача 12.3: статус и оплата в карточке показаны ровно одним органом управления —
// переключателями ниже. Дублирующих чипов (`LcStatusChip` + «оплачено») в шапке нет;
// чип статуса остаётся в списке заказов (`OrdersPage.vue`), где переключателей нет.
//
// Правка живого прогона: переключатели стали ниже (`dense` + уменьшенный кегль), а
// «оплачено» — такой же переключатель (одна опция + `clearable`), а не отдельная
// кнопка со своим размером: раньше статус и оплата читались как два разных органа.
//
// Правка владельца (15.09.2026): активный сегмент «переезжает» к выбранному, а его
// цвет — светофорный, как у чипов статуса: «ожидает» оранжевый, «в работе» красный,
// «готово» зелёный. Цвет/позицию индикатора задают классы `.lc-toggle--waiting/…`
// в scoped-стилях, поэтому в разметке нет инлайн-цветов (см. `docs/UI.md`).
import { computed } from 'vue'
import { ORDER_STATUSES } from 'src/utils/analytics.js'

// Пропсы читаются и в шаблоне, и в скрипте (`statusModifier` ниже — по `status`).
const props = defineProps({
  editMode: { type: Boolean, default: false },
  isNewOrder: { type: Boolean, default: false },
  orderNumber: { type: [String, Number], default: null },
  status: { type: String, default: 'waiting' },
  paid: { type: Boolean, default: false },
  /** Блокировка кнопки share-ссылки, пока идёт запрос. */
  busy: { type: Boolean, default: false },
  /** Показ кнопки share-ссылки на отчёт: не всем нишам нужен публичный отчёт (10.3). */
  showShare: { type: Boolean, default: true },
})

const emit = defineEmits([
  'back',
  'share',
  'clear',
  'remove',
  'edit',
  'save',
  'update:status',
  'update:paid',
])

/** Подписи статусов — общий словарь (`src/utils/analytics.js`). */
const statusOptions = computed(() => ORDER_STATUSES.map(item => ({ label: item.label, value: item.value })))

/**
 * Класс-модификатор статуса для «переезжающего» индикатора. Сам цвет и позиция
 * заливки заданы в стилях (`.lc-toggle--waiting/process/done`), здесь выбирается
 * нужный класс. Незнакомый/пустой статус — нейтральный серый индикатор в первой
 * позиции, без классов вида `lc-toggle--undefined`.
 */
const statusModifier = computed(() => {
  const known = ORDER_STATUSES.some(item => item.value === props.status)
  return `lc-toggle--${known ? props.status : 'unknown'}`
})

/**
 * «Оплачено» — переключатель из одной опции: клик выставляет `true`, повторный клик
 * сбрасывает (`clearable` отдаёт `null`, его и считаем «не оплачено»).
 */
const paidOptions = [{ label: 'оплачено', value: true }]
</script>

<template>
  <div class="lc-orderbar">
    <div class="row items-center no-wrap q-gutter-x-sm">
      <q-btn flat round dense icon="arrow_back" color="secondary" @click="emit('back')">
        <q-tooltip class="text-caption">{{ editMode ? 'отменить правку' : 'назад' }}</q-tooltip>
      </q-btn>

      <div class="col ellipsis">
        <div class="row items-baseline no-wrap q-gutter-x-sm">
          <span class="lc-eyebrow">заказ</span>
          <span class="lc-money text-subtitle2">№ {{ orderNumber ?? '—' }}</span>
          <span v-if="isNewOrder" class="text-caption lc-mute">не сохранён</span>
        </div>
      </div>

      <!-- Вход в правку подписан словом: раньше была только иконка-карандаш,
           и разделы «работа/материалы» выглядели недоступными. -->
      <q-btn
        v-if="!editMode"
        dense
        no-caps
        outline
        color="secondary"
        icon="edit"
        label="Изменить"
        @click="emit('edit')"
      />

      <q-btn
        v-else
        dense
        no-caps
        unelevated
        color="secondary"
        text-color="black"
        icon="save"
        label="Сохранить"
        @click="emit('save')"
      />

      <q-btn
        v-if="showShare"
        flat
        round
        dense
        icon="share"
        color="secondary"
        :loading="busy"
        @click="emit('share')"
      >
        <q-tooltip class="text-caption">скопировать ссылку на отчёт</q-tooltip>
      </q-btn>

      <q-btn flat round dense icon="more_vert" color="secondary">
        <q-tooltip class="text-caption">ещё</q-tooltip>
        <q-menu dark auto-close>
          <q-list dense style="min-width: 220px">
            <q-item v-if="editMode" clickable @click="emit('clear')">
              <q-item-section avatar><q-icon name="cleaning_services" /></q-item-section>
              <q-item-section>очистить позиции</q-item-section>
            </q-item>
            <q-separator dark />
            <q-item clickable class="text-negative" @click="emit('remove')">
              <q-item-section avatar><q-icon name="delete_forever" /></q-item-section>
              <q-item-section>удалить заказ</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>

    <!-- Статус и оплата — один ряд компактных сегментированных переключателей
         (правка живого прогона). Раньше статус был крупным тумблером на всю ширину,
         а «оплачено» — отдельной кнопкой со своим размером. Теперь оба органа одного
         вида: сегменты ниже (`dense` + уменьшенный кегль в стилях), интерактив один.

         Правка владельца (15.09.2026): активный сегмент не «вспыхивает» заливкой,
         а плавно переезжает к выбранному — под подписями лежит цветной индикатор
         (`.lc-toggle::before`). Цвет индикатора светофорный, как у чипов статуса:
         «ожидает» оранжевый, «в работе» красный, «готово» зелёный; сегмент оплаты
         зелёный — как чип «оплачено» в списке заказов. -->
    <div class="row items-center no-wrap q-gutter-x-sm q-mt-sm">
      <q-btn-toggle
        :model-value="status"
        class="col lc-toggle"
        :class="statusModifier"
        spread
        dense
        no-caps
        unelevated
        :options="statusOptions"
        @update:model-value="value => emit('update:status', value)"
      />

      <q-btn-toggle
        :model-value="paid"
        class="lc-toggle"
        :class="[paid ? 'lc-toggle--on' : null, 'lc-toggle--paid']"
        dense
        no-caps
        unelevated
        clearable
        :options="paidOptions"
        @update:model-value="value => emit('update:paid', value === true)"
      />
    </div>
  </div>
</template>

<style scoped>
.lc-orderbar {
  background: var(--lc-surface);
  border: 1px solid var(--lc-border);
  border-radius: var(--lc-radius);
  padding: 10px 12px;
}

/* Переключатели статуса и оплаты: один компактный сегмент на оба органа.
   `dense` задаёт внутренние отступы, здесь ужимаем высоту и кегль, чтобы шапка
   заказа занимала меньше места (правка живого прогона). */
.lc-toggle {
  position: relative;
  border-radius: var(--lc-radius-sm);
  overflow: hidden;
  background: var(--lc-surface-3);
}

/* «Переезжающий» индикатор (правка владельца 15.09.2026). `::before` — первый
   ребёнок группы, поэтому лежит ПОД подписями: сегменты прозрачные, текст читается
   поверх цветной заливки. Ширина — один сегмент (`--lc-toggle-count`), положение —
   номер активного (`--lc-toggle-shift`); и `transform`, и `background-color`
   анимированы, так что смена статуса — переезд с одновременной сменой цвета. */
.lc-toggle::before {
  content: '';
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  z-index: 0;
  /* Ширина = сегмент минус отступы по 2px. Тогда шаг переезда — это ширина
     индикатора ПЛЮС те же 4px (`100% + 4px`), и «пилюля» встаёт ровно в сегмент
     на любой позиции, а не только в крайние. */
  width: calc(100% / var(--lc-toggle-count, 1) - 4px);
  border-radius: var(--lc-radius-sm);
  background-color: var(--lc-toggle-color, var(--lc-border-strong));
  transform: translateX(calc(var(--lc-toggle-shift, 0) * (100% + 4px)));
  transition:
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.28s ease,
    opacity 0.28s ease;
  pointer-events: none;
}

/* Светофорная логика — те же токены, что у чипов статуса (`.lc-status--*`).
   `--lc-toggle-ink` — цвет текста на заливке: на оранжевом тёмный, на красном и
   зелёном белый (белый на оранжевом не читался бы). */
.lc-toggle--waiting {
  --lc-toggle-count: 3;
  --lc-toggle-shift: 0;
  --lc-toggle-color: var(--lc-waiting);
  --lc-toggle-ink: #241a00;
}

.lc-toggle--process {
  --lc-toggle-count: 3;
  --lc-toggle-shift: 1;
  --lc-toggle-color: var(--lc-process);
  --lc-toggle-ink: #ffffff;
}

.lc-toggle--done {
  --lc-toggle-count: 3;
  --lc-toggle-shift: 2;
  --lc-toggle-color: var(--lc-done);
  --lc-toggle-ink: #ffffff;
}

/* Незнакомый/пустой статус — нейтральный серый индикатор в первой позиции. */
.lc-toggle--unknown {
  --lc-toggle-count: 3;
  --lc-toggle-shift: 0;
  --lc-toggle-color: var(--lc-border-strong);
  --lc-toggle-ink: var(--lc-text);
}

/* «Оплачено» — один сегмент: зелёная заливка, как чип оплаты. Пока значение не
   выставлено, индикатор скрыт и появляется плавно (через `opacity`). */
.lc-toggle--paid {
  --lc-toggle-count: 1;
  --lc-toggle-color: var(--lc-paid);
  --lc-toggle-ink: #ffffff;
}

.lc-toggle--paid:not(.lc-toggle--on)::before {
  opacity: 0;
}

.lc-toggle :deep(.q-btn) {
  position: relative;
  z-index: 1;
  min-height: 28px;
  padding: 2px 6px;
  font-size: 12px;
  /* `!important` — потому что Quasar красит сегмент классами палитры
     (`.bg-primary`/`.text-white`, у `toggle-color` дефолт — `primary`), а они
     объявлены с `!important`. Сегмент обязан быть прозрачным: заливку рисует
     индикатор ниже, а не сама кнопка. */
  background: transparent !important;
  color: var(--lc-text-dim) !important;
  transition: color 0.28s ease;
}

/* Активный сегмент: подписи подстраиваются под цвет индикатора. Quasar проставляет
   `aria-pressed` на кнопку сегмента — по нему и цепляемся, без своих классов. */
.lc-toggle :deep(.q-btn[aria-pressed='true']) {
  color: var(--lc-toggle-ink, var(--lc-text)) !important;
}

.lc-toggle :deep(.q-btn__content) {
  flex-wrap: nowrap;
  white-space: nowrap;
}
</style>

