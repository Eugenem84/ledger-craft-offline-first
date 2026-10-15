// test/android-keyboard-insets.test.js
//
// Клавиатура не накрывает поля ввода (задача 14.30, живой отчёт мастера 12.10.2026
// с боевого контура: «всплывающая клавиатура загораживает текст» — и в «комментариях»
// карточки заказа, и на входе/регистрации).
//
// Дефект нативный: с `targetSdk 35` Android 15 включает edge-to-edge принудительно,
// а Capacitor 7 в режиме `android.adjustMarginsForEdgeToEdge: "auto"` раздаёт отступы
// только системных панелей (`systemBars`/`displayCutout`), поглощает остальные инсеты
// и про клавиатуру (`Type.ime()`) не знает — окно не уменьшалось.
//
// Тесты читают исходники (как `test/haptics.test.js` и `test/feedback-dialog.test.js`):
// Android-код в vitest не выполняется, но контракт «манифест + слушатель инсетов»
// проверить можно, и без него правку легко потерять при следующем `cap sync`.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(path.join(root, relative), 'utf8')

const MAIN_ACTIVITY = 'src-capacitor/android/app/src/main/java/com/ledgercraft/app/MainActivity.java'
const MANIFEST = 'src-capacitor/android/app/src/main/AndroidManifest.xml'
const CAPACITOR_CONFIG = 'src-capacitor/capacitor.config.json'

describe('14.30 клавиатура не накрывает поля ввода (Android 15, edge-to-edge)', () => {
  it('MainActivity учитывает инсет клавиатуры, а не только системные панели', () => {
    const activity = read(MAIN_ACTIVITY)

    expect(activity).toContain('WindowInsetsCompat.Type.ime()')
    expect(activity).toContain('WindowInsetsCompat.Type.systemBars()')
    expect(activity).toContain('WindowInsetsCompat.CONSUMED')
    // Нижний отступ — максимум из панели навигации и клавиатуры: клавиатура выше.
    expect(activity).toContain('Math.max(bars.bottom, ime.bottom)')
  })

  it('слушатель ставится после super.onCreate() — иначе его перезапишет Capacitor', () => {
    const activity = read(MAIN_ACTIVITY)

    const superIndex = activity.indexOf('super.onCreate(savedInstanceState);')
    const patchIndex = activity.indexOf('applyKeyboardInsets();')

    expect(superIndex).toBeGreaterThan(-1)
    expect(patchIndex).toBeGreaterThan(-1)
    expect(patchIndex).toBeGreaterThan(superIndex)
  })

  it('на Android 12–14 не вмешиваемся: там отступы даёт платформа', () => {
    const activity = read(MAIN_ACTIVITY)

    expect(activity).toContain('Build.VERSION_CODES.VANILLA_ICE_CREAM')
    expect(activity).toContain('windowOptOutEdgeToEdgeEnforcement')
  })

  it('манифест просит систему сообщать инсет IME (adjustResize)', () => {
    expect(read(MANIFEST)).toContain('android:windowSoftInputMode="adjustResize"')
  })

  it('фикс системных панелей не отключён: отступы edge-to-edge остаются "auto"', () => {
    const config = JSON.parse(read(CAPACITOR_CONFIG))

    expect(config.android.adjustMarginsForEdgeToEdge).toBe('auto')
  })
})
