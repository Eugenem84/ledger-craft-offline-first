// src/utils/updateNotice.js
//
// Модель крупного уведомления об обновлении (задача 14.37, правка владельца 19.10.2026:
// «нормальное большое пуш оповещение сверху о том что появилось обновление и прям в пуше
// заметка что нового… и в пуше сразу кнопка типа установить или позднее»).
//
// Уведомление не решает, **есть ли** обновление: это уже делает `appUpdateView`
// (он же ведёт чип в `UpdateBanner`, задача 13.9). Здесь только текст «пуша» —
// заголовок, версия, список «что нового» и подпись кнопки, — чтобы чип, диалог и
// уведомление не разъезжались по смыслу.
import { appUpdateView, updateReleaseLabel } from 'src/utils/appUpdateView.js'
import { parseReleaseNotes } from 'src/utils/releaseNotes.js'

/** Заголовки по состоянию: обязательное обновление не прячется за «Позже». */
const TITLES = {
  mandatory: 'Нужно обновить приложение',
  optional: 'Доступно обновление приложения',
  ota: 'Доступно обновление',
  ota_ready: 'Обновление готово к запуску',
}

/**
 * Что показать в «пуше» об обновлении.
 *
 * @param {object} status снимок `updateService.getStatus()`
 * @returns {{visible: boolean, kind: string, title: string, subtitle: string,
 *   notes: string[], canDismiss: boolean, actionLabel: string, actionIcon: string}}
 */
export function updateNoticeView(status) {
  const s = status || {}
  const view = appUpdateView(s)
  const release = s.release || null
  const bundle = release?.bundle || null
  const ota = view.kind === 'ota' || view.kind === 'ota_ready'

  const hidden = {
    visible: false,
    kind: view.kind,
    title: '',
    subtitle: '',
    notes: [],
    canDismiss: false,
    actionLabel: '',
    actionIcon: '',
  }

  if (view.visible !== true) return hidden

  // У бандла свои примечания (что изменилось именно в веб-слое), иначе — релизные.
  const notes = parseReleaseNotes(ota ? bundle?.notes || release?.notes : release?.notes)
  const version = ota ? String(bundle?.version || '') : updateReleaseLabel(release)

  const subtitle = ota
    ? version
      ? `без установки · ${version}`
      : 'без установки'
    : version
      ? `версия ${version}`
      : ''

  const ready = view.kind === 'ota_ready'

  return {
    visible: true,
    kind: view.kind,
    title: TITLES[view.kind] || TITLES.ota,
    subtitle,
    notes,
    canDismiss: view.canDismiss === true,
    actionLabel: ready ? 'Перезапустить' : 'Установить',
    actionIcon: ready ? 'restart_alt' : ota ? 'cloud_download' : 'system_update_alt',
  }
}
