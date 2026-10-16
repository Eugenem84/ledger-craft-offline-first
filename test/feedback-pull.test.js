// test/feedback-pull.test.js
//
// Задачи 14.9 и 14.31: у отчёта в контуре есть **статус разбора**, который показывает
// домашний монитор (экран «Фитбек»). Пока мы писали вердикты только в репозиторий
// (`feedback/DECISIONS.md`), монитор честно показывал «не разобран» по всем отчётам —
// включая давно исправленные. Поэтому у `npm run feedback:pull` появились `--check`
// и `--mark=<статус>`, а курсор выгрузки стал **своим у каждого контура** (иначе выгрузка
// с prod «съедала» отчёты dev — так и потерялся отчёт `b17a0b3f` от 18.09).
//
// Скрипт — CLI с сетью, поэтому проверяем его чистые части: разбор флагов, выбор целей
// для пометки, курсор по контурам и запрет дубликатов файлов в инбоксе.
import { describe, expect, it } from 'vitest'
import {
  contourKey,
  fileNameFor,
  isValidStatus,
  parseArgs,
  resolveMarkTargets,
  resolveSince,
  STATUSES,
} from '../scripts/pull-feedback.mjs'

describe('14.9 feedback:pull — разбор флагов пометки', () => {
  it('понимает --check, --mark, --note и несколько --uuid (в том числе списком)', () => {
    const options = parseArgs([
      '--check',
      '--mark=accepted',
      '--note=14.33, бандл 1.21.4',
      '--uuid=cf4bffe3,420674ad',
      '--uuid=31908428',
    ])

    expect(options.check).toBe(true)
    expect(options.mark).toBe('accepted')
    expect(options.note).toBe('14.33, бандл 1.21.4')
    expect(options.uuid).toEqual(['cf4bffe3', '420674ad', '31908428'])
  })

  it('старые флаги не сломаны', () => {
    const options = parseArgs(['--all', '--since=2026-09-14T00:00:00Z', '--api=https://x/api'])

    expect(options).toMatchObject({ all: true, since: '2026-09-14T00:00:00Z', api: 'https://x/api' })
    expect(options.mark).toBe(null)
    expect(options.uuid).toEqual([])
  })

  it('статус ограничен четырьмя значениями контракта', () => {
    for (const status of STATUSES) expect(isValidStatus(status)).toBe(true)

    expect(isValidStatus('done')).toBe(false)
    expect(isValidStatus('')).toBe(false)
    expect(isValidStatus(undefined)).toBe(false)
  })
})

describe('14.9 feedback:pull — что помечать', () => {
  const reports = [{ uuid_id: 'cf4bffe3-4b0c-41b2-8724-9770c1b87eed' }, { uuid_id: '420674ad-9cb5' }]

  it('--uuid принимает полный id и префикс', () => {
    expect(resolveMarkTargets({ uuid: ['cf4bffe3'] }, reports, [])).toEqual([
      'cf4bffe3-4b0c-41b2-8724-9770c1b87eed',
    ])
    expect(resolveMarkTargets({ uuid: ['420674ad-9cb5'] }, reports, [])).toEqual(['420674ad-9cb5'])
  })

  it('без --uuid помечаем то, что выгружено этим запуском', () => {
    expect(resolveMarkTargets({}, reports, ['420674ad-9cb5'])).toEqual(['420674ad-9cb5'])
  })

  it('без --uuid и без новых отчётов — понятная ошибка, а не тишина', () => {
    expect(() => resolveMarkTargets({}, reports, [])).toThrow(/Нечего помечать/)
  })

  it('несуществующий отчёт и неоднозначный префикс — ошибки словами', () => {
    expect(() => resolveMarkTargets({ uuid: ['deadbeef'] }, reports, [])).toThrow(/не найден/)
    expect(() =>
      resolveMarkTargets({ uuid: ['4206'] }, [{ uuid_id: '420674ad' }, { uuid_id: '420674ae' }], [])
    ).toThrow(/подходит нескольким/)
  })
})

describe('14.31 feedback:pull — курсор по контурам и без дубликатов', () => {
  it('ключ контура — домен без схемы и пути', () => {
    expect(contourKey('https://ledgercraft.ru/api')).toBe('ledgercraft.ru')
    expect(contourKey('https://ledgercraft.dev.medovf2h.beget.tech/api/')).toBe(
      'ledgercraft.dev.medovf2h.beget.tech'
    )
    expect(contourKey('HTTPS://Example.COM/api')).toBe('example.com')
  })

  it('курсор берётся у своего контура: prod не съедает отчёты dev', () => {
    const state = {
      contours: {
        'ledgercraft.ru': { lastPulledAt: '2026-10-16T16:00:00.000Z' },
        'ledgercraft.dev.medovf2h.beget.tech': { lastPulledAt: '2026-10-16T15:00:00.000Z' },
      },
    }

    expect(resolveSince({ options: {}, state, api: 'https://ledgercraft.ru/api' })).toBe(
      '2026-10-16T16:00:00.000Z'
    )
    expect(
      resolveSince({ options: {}, state, api: 'https://ledgercraft.dev.medovf2h.beget.tech/api' })
    ).toBe('2026-10-16T15:00:00.000Z')
  })

  it('--all читает всё, явный --since важнее курсора, незнакомый контур — без курсора', () => {
    const state = { contours: { 'ledgercraft.ru': { lastPulledAt: '2026-10-16T16:00:00.000Z' } } }

    expect(resolveSince({ options: { all: true }, state, api: 'https://ledgercraft.ru/api' })).toBe(null)
    expect(
      resolveSince({
        options: { since: '2026-09-01T00:00:00.000Z' },
        state,
        api: 'https://ledgercraft.ru/api',
      })
    ).toBe('2026-09-01T00:00:00.000Z')
    expect(resolveSince({ options: {}, state, api: 'https://novy.ru/api' })).toBe(null)
  })

  it('повторная выгрузка сохраняет имя файла: дубликатов в инбоксе не появляется', () => {
    const existing = { fileName: '2026-09-13_23-35-38-cf4bffe3.md' }

    expect(fileNameFor('cf4bffe3-4b0c', existing, '2026-10-16_19-30-00')).toBe(
      '2026-09-13_23-35-38-cf4bffe3.md'
    )
    expect(fileNameFor('cf4bffe3-4b0c', undefined, '2026-10-16_19-30-00')).toBe(
      '2026-10-16_19-30-00-cf4bffe3.md'
    )
  })
})
