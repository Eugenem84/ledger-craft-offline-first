// src/stores/useUpdateStore.js
//
// Состояние обновления приложения для UI (Фаза 13, задачи 13.9 и 13.13).
//
// Стор — тонкая обёртка над `updateService`: сервис знает про сеть, файлы и
// нативный установщик, стор только держит актуальный снимок для компонентов и
// превращает действия пользователя («обновить», «позже») в вызовы сервиса.
import { defineStore } from 'pinia'
import updateService from 'src/services/updateService.js'
import {
  appUpdateStatusText,
  appUpdateView,
  formatBytes,
  updateReleaseLabel,
} from 'src/utils/appUpdateView.js'

export const useUpdateStore = defineStore('update', {
  state: () => ({
    status: updateService.getStatus(),
    installing: false,
    installError: null,
    /** Версия, установка которой завершилась — показываем сообщение один раз. */
    installedVersion: null,
    /** Идёт скачивание OTA-бандла (Фаза 15). */
    applyingBundle: false,
  }),

  getters: {
    /** Состояние баннера/чипа (см. `appUpdateView`). */
    view: state => appUpdateView(state.status),
    /** Текст для секции «О приложении» — есть всегда, даже когда баннера нет. */
    statusText: state => appUpdateStatusText(state.status),
    release: state => state.status.release,
    releaseLabel: state => updateReleaseLabel(state.status.release),
    releaseNotes: state => state.status.release?.notes || '',
    releaseSize: state => formatBytes(state.status.release?.sizeBytes),
    currentVersion: state => state.status.current,
    currentLabel: state =>
      state.status.current.versionName ||
      (state.status.current.versionCode ? `сборка ${state.status.current.versionCode}` : 'неизвестна'),
    downloading: state => state.status.downloading,
    downloadProgress: state => state.status.downloadProgress,
    /** Есть что обновлять и есть ссылка на файл — кнопка «Обновить» осмысленна. */
    canUpdate: state => state.status.available === true && Boolean(state.status.release?.apkUrl),
    /** OTA веб-слоя (Фаза 15): есть бандл под этот APK — можно обновить без установки. */
    canApplyBundle: state =>
      state.status.bundleAvailable === true && Boolean(state.status.release?.bundle?.url),
    bundle: state => state.status.release?.bundle || null,
    bundleVersion: state => state.status.release?.bundle?.version || '',
    bundleSize: state => formatBytes(state.status.release?.bundle?.sizeBytes),
    bundleSizeBytes: state => Number(state.status.release?.bundle?.sizeBytes) || 0,
    bundleReady: state => state.status.bundleReady === true,
    /**
     * Версия OTA-бандла, применённого при перезапуске — разовое сообщение.
     * Берём из состояния сервиса: баннер подписывается позже, чем плагин отвечает,
     * поэтому «съесть» одноразовое значение в `bind()` нельзя (дефект сборки 1.9).
     */
    appliedBundleVersion: state => state.status.appliedBundle || null,
    currentBundleId: state => state.status.currentBundleId || '',
    downloadingBundle: state => state.status.downloadingBundle,
    bundleProgress: state => state.status.bundleProgress,
    /**
     * Диалог показывает OTA-сценарий (без установки), а не установку APK.
     * Считаем из той же чистой функции, что и баннер, — чтобы вид и действия
     * не разъезжались.
     */
    otaMode: state => ['ota', 'ota_ready'].includes(appUpdateView(state.status).kind),
  },

  actions: {
    /** Подписка на сервис (вызывается из `UpdateBanner` до первого рендера). */
    bind() {
      this.unbind()
      this.status = updateService.getStatus()
      this._unsubscribe = updateService.subscribe(status => {
        this.status = status
      })
      this.installedVersion = updateService.consumeInstalledVersion()
      // OTA веб-слоя (Фаза 15): инициализируем **после монтирования**, а не в boot-файле.
      // Так старт приложения не зависит от нативного плагина: в сборке 1.9 `await` на нём
      // в boot-цепочке дал чёрный экран (Quasar ждёт boot-файлы перед монтированием).
      updateService.startBundleSupport()
    },

    unbind() {
      if (this._unsubscribe) {
        this._unsubscribe()
        this._unsubscribe = null
      }
    },

    /**
     * Ручная проверка из настроек: сбрасывает «позже» и обходит паузу 6 часов.
     *
     * ⚠️ `refreshCurrentVersion()` возвращает **версию** (`{versionCode, versionName}`), а не
     * состояние сервиса: присваивать её в `this.status` нельзя — стор терял релиз, флаги и
     * «когда проверяли», поэтому в разделе «приложение» оставалось «обновления ещё не
     * проверялись», а кнопка выглядела мёртвой (дефект живой сборки 1.11). Состояние в стор
     * приносят подписка `bind()` и возврат `check()`.
     */
    async checkNow() {
      updateService.clearDismiss()
      // Версию перечитываем (если нативная часть её не отдала — «версия неизвестна»),
      // но в стор её не подменяем: это не состояние, а одно значение.
      await updateService.refreshCurrentVersion()
      this.status = await updateService.check({ force: true })

      return this.status
    },

    /** «Напомнить позже» — баннер скрывается до следующего релиза. */
    dismiss() {
      this.status = updateService.dismiss()
    },

    /** Запасной путь: скачать APK системным браузером. */
    async openDownloadPage() {
      return updateService.openDownloadPage()
    },

    /**
     * Обновление «одной кнопкой» (задача 13.13):
     *   • есть нативный установщик → качаем в приложении и зовём системный диалог;
     *   • нет (веб-сборка, старый APK без плагина) → открываем ссылку в браузере;
     *   • нет разрешения на установку → отправляем в системные настройки.
     */
    async install() {
      this.installError = null
      this.installing = true

      try {
        const canInstallInApp = await updateService.isInstallerAvailable()

        if (!canInstallInApp) {
          const opened = await updateService.openDownloadPage()

          if (!opened) this.installError = 'Не удалось открыть ссылку на файл обновления'

          return opened
        }

        const granted = await updateService.canInstall()

        if (!granted) {
          await updateService.openInstallSettings()
          this.installError =
            'Разрешите установку приложений из этого источника и нажмите «Обновить» ещё раз'

          return false
        }

        await updateService.downloadAndInstall()

        return true
      } catch (error) {
        this.installError = error?.message || 'Не удалось обновить приложение'

        return false
      } finally {
        this.installing = false
      }
    },

    /** Скрывает сообщение «обновление установлено». */
    clearInstalledNotice() {
      this.installedVersion = null
    },

    /**
     * OTA-обновление веб-слоя (Фаза 15): скачать бандл и применить его при
     * следующем запуске. Ни установки, ни системных диалогов, ни потери данных —
     * меняется только «начинка» приложения (JS/CSS/HTML).
     */
    async applyBundle({ reload = false } = {}) {
      this.installError = null
      this.applyingBundle = true

      try {
        await updateService.downloadAndApplyBundle({ reload })

        return true
      } catch (error) {
        this.installError = error?.message || 'Не удалось скачать обновление'

        return false
      } finally {
        this.applyingBundle = false
      }
    },

    /** «Перезапустить сейчас» — применить скачанный бандл, не закрывая приложение. */
    async restartNow() {
      this.installError = null

      try {
        return await updateService.restartNow()
      } catch (error) {
        this.installError = error?.message || 'Не удалось перезапустить приложение'

        return false
      }
    },

    /** Скрывает сообщение «обновление без установки применено». */
    clearAppliedBundleNotice() {
      updateService.clearAppliedBundleNotice()
    },
  },
})
