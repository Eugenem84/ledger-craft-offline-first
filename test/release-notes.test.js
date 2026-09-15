// test/release-notes.test.js
//
// Правка владельца 15.09.2026: в карточке обновления «что нового» перечисляется
// **списком через тире**, а не строкой через запятую — на телефоне слитный абзац
// не читался. Разбор строки заметок живёт в `src/utils/releaseNotes.js` и покрыт
// здесь: сервер (`/app-version`) отдаёт заметки как есть, поэтому разделители и
// маркеры списка должны пониматься на клиенте.
import { describe, expect, it } from 'vitest'
import { parseReleaseNotes } from 'src/utils/releaseNotes.js'

describe('«что нового» списком (правка владельца 15.09.2026)', () => {
  it('заметки через запятую становятся отдельными пунктами', () => {
    expect(parseReleaseNotes('Чиним склад, Ускорили синк, Поправили маржу')).toEqual([
      'Чиним склад',
      'Ускорили синк',
      'Поправили маржу',
    ])
  })

  it('точка с запятой и перевод строки — тоже разделители', () => {
    expect(parseReleaseNotes('Склад;\nМаржа\n\nИстория склада')).toEqual([
      'Склад',
      'Маржа',
      'История склада',
    ])
  })

  it('маркер списка в тексте не дублируется', () => {
    expect(parseReleaseNotes('- Склад, — Маржа, • История')).toEqual([
      'Склад',
      'Маржа',
      'История',
    ])
  })

  it('одна заметка без разделителей остаётся одним пунктом', () => {
    expect(parseReleaseNotes('Починили «Поступление»')).toEqual(['Починили «Поступление»'])
  })

  it('пустые пункты и пустые значения отбрасываются', () => {
    expect(parseReleaseNotes('Склад, , ;,')).toEqual(['Склад'])
    expect(parseReleaseNotes('')).toEqual([])
    expect(parseReleaseNotes('   ')).toEqual([])
    expect(parseReleaseNotes(null)).toEqual([])
    expect(parseReleaseNotes(undefined)).toEqual([])
  })
})
