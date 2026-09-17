<script setup>
// src/components/settings/ReportSettingsPanel.vue
//
// Вкладка «отчёты» в настройках (правка владельца 17.09.2026: «на вкладке отчёты сделать
// отчёты сильно с настройками»).
//
// Мастер сам решает, как выглядит отчёт клиенту:
//   • формат — публичная ссылка (её выдаёт сервер) или текст целиком, который копируется
//     в буфер и вставляется в мессенджер как есть;
//   • состав — имя клиента, телефон, модель техники и раздельные итоги (за работы и за
//     запчасти). Статус, позиции, общий «Итого» и комментарий есть всегда.
//
// Под тумблерами — **живой образец**: тот же сборщик (`utils/reportText.js`), что работает
// в карточке заказа, поэтому мастер видит результат настройки до сохранения, а не гадает.
// Подпись с сайтом пока не показываем (`REPORT_CONTENT_HIDDEN`) — «сайт пока убери,
// добавим потом».
//
// Панель — «глупый» компонент: значения приходят пропсами, изменения уходят событиями, а в
// storage их пишет диалог настроек **сразу** (правка владельца 17.09.2026: «кнопки отмена и
// сохранить вообще не надо» — настройка применяется в момент изменения).
import { computed } from 'vue'
import {
  DEFAULT_REPORT_CONTENT,
  REPORT_CONTENT_HIDDEN,
  REPORT_CONTENT_HINTS,
  REPORT_CONTENT_LABELS,
  REPORT_FORMAT_HINTS,
  REPORT_FORMAT_LABELS,
  REPORT_FORMAT_LINK,
  REPORT_FORMAT_TEXT,
} from 'src/utils/reportSettings.js'
import { buildOrderReportText } from 'src/utils/reportText.js'

const props = defineProps({
  /** `link` — публичная ссылка, `text` — весь отчёт текстом. */
  format: { type: String, default: REPORT_FORMAT_LINK },
  /** Состав отчёта: `{ clientName, clientPhone, model, servicesTotal, partsTotal, … }`. */
  content: { type: Object, default: () => ({ ...DEFAULT_REPORT_CONTENT }) },
})

const emit = defineEmits(['update:format', 'update:content'])

const formatOptions = [
  { label: REPORT_FORMAT_LABELS[REPORT_FORMAT_LINK], value: REPORT_FORMAT_LINK },
  { label: REPORT_FORMAT_LABELS[REPORT_FORMAT_TEXT], value: REPORT_FORMAT_TEXT },
]

/** Флаги для тумблеров: скрытые («подпись с сайтом») в интерфейс пока не выводим. */
const contentFlags = Object.keys(DEFAULT_REPORT_CONTENT).filter(
  flag => !REPORT_CONTENT_HIDDEN.includes(flag)
)

/**
 * Образец отчёта: маленький заказ (работа + материал), чтобы образец читался целиком и
 * было видно, как «Итого за работы» и «Итого за запчасти» расходятся с общим итогом.
 */
const SAMPLE_REPORT = Object.freeze({
  statusLabel: 'готово',
  client: { name: 'Иван Петров', phone: '+7 999 000-00-00' },
  model: 'Trek Marlin 5',
  services: [{ name: 'Замена камеры', quantity: 1, unitPrice: 500 }],
  materials: [{ name: 'Камера 26', quantity: 2, unitPrice: 150 }],
  products: [],
  servicesTotal: 500,
  partsTotal: 300,
  total: 800,
  comments: 'Проверить тормоза',
})

const preview = computed(() =>
  buildOrderReportText(SAMPLE_REPORT, {
    content: { ...DEFAULT_REPORT_CONTENT, ...props.content },
  })
)

const setFlag = (flag, value) => emit('update:content', { ...props.content, [flag]: value === true })
</script>

<template>
  <div>
    <div class="text-caption lc-mute">Что копирует кнопка «поделиться» в карточке заказа.</div>

    <q-btn-toggle
      :model-value="props.format"
      class="lc-seg full-width q-mt-sm"
      spread
      dense
      no-caps
      unelevated
      :options="formatOptions"
      @update:model-value="value => emit('update:format', value)"
    />

    <div class="text-caption lc-mute q-mt-sm">
      <b>{{ REPORT_FORMAT_LABELS[props.format] }}</b> — {{ REPORT_FORMAT_HINTS[props.format] }}
    </div>

    <div v-if="props.format !== REPORT_FORMAT_TEXT" class="text-caption lc-mute q-mt-xs">
      Состав ниже настраивает только текстовый отчёт: ссылку собирает сервер.
    </div>

    <div class="lc-eyebrow q-mt-lg">что будет в отчёте</div>

    <div v-for="flag in contentFlags" :key="flag" class="row items-center no-wrap q-mt-sm">
      <div class="col">
        <div class="lc-muted">{{ REPORT_CONTENT_LABELS[flag] }}</div>
        <div class="text-caption lc-mute">{{ REPORT_CONTENT_HINTS[flag] }}</div>
      </div>
      <q-toggle
        :model-value="props.content?.[flag] === true"
        color="secondary"
        @update:model-value="value => setFlag(flag, value)"
      />
    </div>

    <div class="text-caption lc-mute q-mt-sm">
      Статус, позиции, общий «Итого» и комментарий есть в отчёте всегда — их выключить нельзя.
    </div>

    <div class="lc-eyebrow q-mt-lg">образец отчёта</div>
    <pre class="lc-report-preview">{{ preview }}</pre>
    <div class="text-caption lc-mute q-mt-xs">
      Данные в образце — пример; в карточке заказа подставится ваш заказ.
    </div>
  </div>
</template>

<style scoped>
/* Образец показывается моноширинно-«мессенджерно»: та же разметка строк, что получит
   клиент, поэтому переносы и пустые строки видно до отправки. */
.lc-report-preview {
  margin: 8px 0 0;
  padding: 12px;
  border: 1px solid var(--lc-border);
  border-radius: var(--lc-radius-sm);
  background: var(--lc-surface-2);
  color: var(--lc-text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
