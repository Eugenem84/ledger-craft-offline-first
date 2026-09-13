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
    },

    unbind() {
      if (this._unsubscribe) {
        this._unsubscribe()
        this._unsubscribe = null
      }
    },

    /** Ручная проверка из настроек: сбрасывает «позже» и обходит паузу 6 часов. */
    async checkNow() {
      updateService.clearDismiss()
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
  },
})
