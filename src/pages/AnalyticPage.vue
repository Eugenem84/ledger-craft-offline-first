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
  <q-page padding class="bg-dark text-white">
    <div class="row items-center justify-between q-mb-sm">
      <div>
        <div class="text-subtitle1">аналитика</div>
        <div class="text-caption text-grey">{{ specializationName }}</div>
      </div>
      <q-btn
        flat
        round
        icon="refresh"
        color="yellow"
        :loading="analytics.loading"
        @click="analytics.reload()"
      />
    </div>

    <q-banner v-if="analytics.error" dense class="bg-negative text-white q-mb-md">
      не удалось посчитать аналитику: {{ analytics.error.message }}
    </q-banner>

    <div v-if="!analytics.hasData" class="text-grey text-caption q-mt-md">
      нет данных: заказы появятся здесь, как только вы их заведёте (в выручку входят только
      <b>закрытые и оплаченные</b> заказы)
    </div>

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
          <q-card dark flat bordered>
            <q-card-section class="q-pa-sm">
              <div class="text-caption text-grey">{{ card.label }}</div>
              <div class="text-subtitle1 text-green">{{ money(card.value) }} р</div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Итоги выбранного масштаба + переключатель периода -->
      <q-card dark flat bordered class="q-mb-md">
        <q-card-section class="q-pa-sm">
          <div class="row items-center justify-between q-mb-sm">
            <div class="text-caption text-grey">выручка за период</div>
            <q-btn-toggle
              v-model="period"
              dense
              no-caps
              unelevated
              outline
              toggle-color="yellow"
              color="grey"
              :options="analytics.periodOptions"
            />
          </div>
          <div class="row">
            <div class="col-4">
              <div class="text-caption text-grey">выручка</div>
              <div class="text-h6 text-green">{{ money(analytics.summary.revenue) }} р</div>
            </div>
            <div class="col-4">
              <div class="text-caption text-grey">средний чек</div>
              <div class="text-h6">{{ money(analytics.summary.averageCheck) }} р</div>
            </div>
            <div class="col-4">
              <div class="text-caption text-grey">заказов</div>
              <div class="text-h6">{{ analytics.summary.ordersCount }}</div>
            </div>
          </div>

          <!-- Маржа за период (9.5/9.6): выручка − закупка позиций; у работ закупки нет -->
          <div class="row q-mt-sm">
            <div class="col-4">
              <div class="text-caption text-grey">закупка</div>
              <div class="text-subtitle1 text-orange">{{ money(analytics.summary.cost) }} р</div>
            </div>
            <div class="col-4">
              <div class="text-caption text-grey">маржа</div>
              <div class="text-subtitle1 text-green">{{ money(analytics.summary.margin) }} р</div>
            </div>
            <div class="col-4">
              <div class="text-caption text-grey">наценка</div>
              <div class="text-subtitle1">
                {{ analytics.summary.marginPercent == null ? '—' : `${analytics.summary.marginPercent}%` }}
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Выручка по колонкам выбранного периода -->
      <div class="text-caption text-grey q-mb-xs">выручка по периодам</div>
      <div v-for="bucket in analytics.buckets" :key="bucket.key" class="q-mb-xs">
        <div class="row items-center no-wrap">
          <div class="col-3 text-caption">{{ bucket.label }}</div>
          <div class="col">
            <q-linear-progress :value="ratio(bucket.total, bucketsMax)" size="12px" color="green" />
          </div>
          <div class="col-3 text-right text-caption">
            {{ money(bucket.total) }} <span class="text-grey">({{ bucket.count }})</span>
          </div>
        </div>
      </div>

      <!-- Заказы по текущим статусам (все заказы, не только учтённые) -->
      <div class="text-caption text-grey q-mt-md q-mb-xs">заказы по статусам (сейчас)</div>
      <div v-for="status in analytics.statuses" :key="status.value" class="q-mb-xs">
        <div class="row items-center no-wrap">
          <div class="col-3 text-caption">{{ status.label }}</div>
          <div class="col">
            <q-linear-progress
              :value="ratio(status.count, statusesTotal)"
              size="12px"
              :color="status.value === 'done' ? 'green' : status.value === 'process' ? 'red' : 'orange'"
            />
          </div>
          <div class="col-2 text-right text-caption">{{ status.count }}</div>
        </div>
      </div>

      <!-- Топы за период: работы, товары со склада, ручные позиции -->
      <template
        v-for="top in [
          { title: 'топ работ', rows: analytics.topServices },
          { title: 'топ товаров', rows: analytics.topProducts },
          { title: 'топ материалов', rows: analytics.topMaterials },
        ]"
        :key="top.title"
      >
        <div class="text-caption text-grey q-mt-md q-mb-xs">{{ top.title }}</div>
        <div v-if="!top.rows.length" class="text-caption text-grey">— пусто —</div>
        <div v-for="(row, index) in top.rows" :key="`${top.title}-${index}`" class="q-mb-xs">
          <div class="row items-center no-wrap">
            <div class="col text-caption ellipsis">{{ row.name }}</div>
            <div class="col-2 text-right text-caption text-grey">{{ row.quantity }}</div>
            <!-- Маржа есть только у позиций с закупкой (товары/ручные материалы) — 9.5/9.6 -->
            <div class="col-2 text-right text-caption text-green">
              {{ row.margin == null ? '' : `${money(row.margin)} р` }}
            </div>
            <div class="col-3 text-right text-caption text-green">{{ money(row.total) }} р</div>
          </div>
          <q-linear-progress :value="ratio(row.total, topMax(top.rows))" size="6px" color="yellow" />
        </div>
      </template>
    </template>
  </q-page>
</template>

<style scoped></style>
