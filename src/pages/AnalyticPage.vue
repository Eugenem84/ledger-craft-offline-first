<script setup>
// Страница аналитики (задача 9.1).
//
// Данные — из локальной БД через `useAnalyticsStore` (офлайн-первый подход): страница
// работает без сети, а цифры считаются по той же методике, что на сервере
// (`StatisticRepository`), — «учтённый заказ» = закрыт и оплачен, выручка = позиции,
// период = `updated_at`. Правила живут в `src/utils/analytics.js` и покрыты тестами,
// здесь только представление.
import { computed, onMounted } from 'vue'

import { useAnalyticsStore } from 'src/stores/useAnalyticsStore.js'
import { useSpecializationsStore } from 'src/stores/useSpecializationsStore.js'
// Общие UI-элементы (переработка интерфейса).
import LcEmptyState from 'src/components/ui/LcEmptyState.vue'
import LcPageHeader from 'src/components/ui/LcPageHeader.vue'

const analytics = useAnalyticsStore()
const specializations = useSpecializationsStore()

const period = computed({
  get: () => analytics.period,
  set: value => analytics.setPeriod(value),
})

const specializationName = computed(() => {
  if (!analytics.hasSpecialization) return 'специализация не выбрана'
  return specializations.getSelectedSpecialization?.name ?? '—'
})

/** Максимум по колонкам графика — чтобы полосы были сопоставимы. */
const bucketsMax = computed(() => Math.max(1, ...analytics.buckets.map(bucket => bucket.total)))
const statusesTotal = computed(() =>
  analytics.statuses.reduce((sum, status) => sum + status.count, 0)
)

const money = value => Math.round(Number(value) || 0)
const ratio = (value, max) => (max > 0 ? Math.min(1, Number(value) / max) : 0)
const topMax = list => Math.max(1, ...list.map(item => Number(item.total) || 0))

onMounted(() => analytics.load())
</script>

<template>
  <q-page class="lc-page lc-shell">
    <LcPageHeader title="аналитика" :subtitle="specializationName" icon="insights">
      <template #actions>
        <q-btn
          flat
          round
          dense
          icon="refresh"
          color="secondary"
          :loading="analytics.loading"
          @click="analytics.reload()"
        >
          <q-tooltip class="text-caption">пересчитать</q-tooltip>
        </q-btn>
      </template>
    </LcPageHeader>

    <q-banner v-if="analytics.error" dense class="bg-negative text-white q-mb-md">
      не удалось посчитать аналитику: {{ analytics.error.message }}
    </q-banner>

    <LcEmptyState
      v-if="!analytics.hasData"
      icon="insights"
      title="Данных пока нет"
      hint="В выручку входят только закрытые и оплаченные заказы — заведите и закройте первый заказ."
    />

    <template v-else>
      <!-- Выручка за сегодня/неделю/месяц/год — аналог серверного getProfitDWMY -->
      <div class="row q-col-gutter-sm q-mb-md">
        <div
          v-for="card in [
            { label: 'сегодня', value: analytics.totals.day },
            { label: 'неделя', value: analytics.totals.week },
            { label: 'месяц', value: analytics.totals.month },
            { label: 'год', value: analytics.totals.year },
          ]"
          :key="card.label"
          class="col-6 col-sm-3"
        >
          <div class="lc-kpi">
            <div class="lc-kpi__label">{{ card.label }}</div>
            <div class="lc-kpi__value text-positive">{{ money(card.value) }} р</div>
          </div>
        </div>
      </div>

      <!-- Итоги выбранного масштаба + переключатель периода -->
      <div class="lc-card lc-pad q-mb-md">
        <div class="row items-center justify-between no-wrap q-mb-md q-gutter-x-sm">
          <div class="lc-eyebrow">выручка за период</div>
          <q-btn-toggle
            v-model="period"
            dense
            no-caps
            unelevated
            color="grey-9"
            text-color="grey-5"
            toggle-color="secondary"
            toggle-text-color="black"
            :options="analytics.periodOptions"
          />
        </div>

        <div class="row q-col-gutter-sm">
          <div class="col-4">
            <div class="lc-kpi__label">выручка</div>
            <div class="text-subtitle1 text-positive lc-money">{{ money(analytics.summary.revenue) }} р</div>
          </div>
          <div class="col-4">
            <div class="lc-kpi__label">средний чек</div>
            <div class="text-subtitle1 lc-money">{{ money(analytics.summary.averageCheck) }} р</div>
          </div>
          <div class="col-4">
            <div class="lc-kpi__label">заказов</div>
            <div class="text-subtitle1 lc-money">{{ analytics.summary.ordersCount }}</div>
          </div>
        </div>

        <q-separator dark class="q-my-md" />

        <!-- Маржа за период (9.5/9.6): выручка − закупка позиций; у работ закупки нет -->
        <div class="row q-col-gutter-sm">
          <div class="col-4">
            <div class="lc-kpi__label">закупка</div>
            <div class="text-subtitle2 text-orange lc-money">{{ money(analytics.summary.cost) }} р</div>
          </div>
          <div class="col-4">
            <div class="lc-kpi__label">маржа</div>
            <div class="text-subtitle2 text-positive lc-money">{{ money(analytics.summary.margin) }} р</div>
          </div>
          <div class="col-4">
            <div class="lc-kpi__label">наценка</div>
            <div class="text-subtitle2 lc-money">
              {{ analytics.summary.marginPercent == null ? '—' : `${analytics.summary.marginPercent}%` }}
            </div>
          </div>
        </div>
      </div>

      <!-- Выручка по колонкам выбранного периода -->
      <div class="lc-card lc-pad q-mb-md">
        <div class="lc-eyebrow q-mb-sm">выручка по периодам</div>
        <div v-for="bucket in analytics.buckets" :key="bucket.key" class="row items-center no-wrap q-mb-xs">
          <div class="col-3 text-caption lc-muted">{{ bucket.label }}</div>
          <div class="col q-px-sm">
            <q-linear-progress
              :value="ratio(bucket.total, bucketsMax)"
              size="10px"
              color="positive"
              track-color="grey-9"
              rounded
            />
          </div>
          <div class="col-3 text-right text-caption lc-money">
            {{ money(bucket.total) }}
            <span class="lc-mute">({{ bucket.count }})</span>
          </div>
        </div>
      </div>

      <!-- Заказы по текущим статусам (все заказы, не только учтённые) -->
      <div class="lc-card lc-pad q-mb-md">
        <div class="lc-eyebrow q-mb-sm">заказы по статусам (сейчас)</div>
        <div v-for="status in analytics.statuses" :key="status.value" class="row items-center no-wrap q-mb-xs">
          <div class="col-3 text-caption lc-muted">{{ status.label }}</div>
          <div class="col q-px-sm">
            <q-linear-progress
              :value="ratio(status.count, statusesTotal)"
              size="10px"
              :color="
                status.value === 'done' ? 'positive' : status.value === 'process' ? 'negative' : 'warning'
              "
              track-color="grey-9"
              rounded
            />
          </div>
          <div class="col-2 text-right text-caption lc-money">{{ status.count }}</div>
        </div>
      </div>

      <!-- Топы за период: работы, товары со склада, ручные позиции -->
      <div class="lc-card lc-pad">
        <template
          v-for="top in [
            { title: 'топ работ', rows: analytics.topServices },
            { title: 'топ товаров', rows: analytics.topProducts },
            { title: 'топ материалов', rows: analytics.topMaterials },
          ]"
          :key="top.title"
        >
          <div class="lc-eyebrow q-mt-md q-mb-sm">{{ top.title }}</div>
          <div v-if="!top.rows.length" class="text-caption lc-mute q-mb-sm">— пусто —</div>
          <div v-for="(row, index) in top.rows" :key="`${top.title}-${index}`" class="q-mb-sm">
            <div class="row items-center no-wrap">
              <div class="col text-caption ellipsis">{{ row.name }}</div>
              <div class="col-2 text-right text-caption lc-mute">{{ row.quantity }}</div>
              <!-- Маржа есть только у позиций с закупкой (товары/ручные материалы) — 9.5/9.6 -->
              <div class="col-2 text-right text-caption text-positive lc-money">
                {{ row.margin == null ? '' : `${money(row.margin)} р` }}
              </div>
              <div class="col-3 text-right text-caption text-positive lc-money">
                {{ money(row.total) }} р
              </div>
            </div>
            <q-linear-progress
              :value="ratio(row.total, topMax(top.rows))"
              size="6px"
              color="secondary"
              track-color="grey-9"
              rounded
            />
          </div>
        </template>
      </div>
    </template>
  </q-page>
</template>

<style scoped></style>
