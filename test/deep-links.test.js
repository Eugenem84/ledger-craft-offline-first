// test/deep-links.test.js
//
// Фаза 16: ссылки из писем открывают приложение. Проверяем чистый разборчик
// `src/domain/deepLinks.js` — без Capacitor и без роутера. Обе формы ссылки:
// своя схема (`ledgercraft://…`, её отдаёт bridge-страница бэкенда) и https App Link
// (`https://<host>/app/…`, её открывает Android, когда домен верифицирован).
import { describe, expect, it } from 'vitest'
import { APP_LINK_PREFIX, DEEP_LINK_SCHEME, parseDeepLink } from 'src/domain/deepLinks.js'

const HOST = 'ledgercraft.dev.medovf2h.beget.tech'

describe('Фаза 16 разбор ссылок из писем', () => {
  it('схема приложения и префикс App Link совпадают с бэкендом (config/app-links.php)', () => {
    expect(DEEP_LINK_SCHEME).toBe('ledgercraft')
    expect(APP_LINK_PREFIX).toBe('app')
  })

  it('своя схема: сброс пароля с токеном и email', () => {
    expect(
      parseDeepLink(`${DEEP_LINK_SCHEME}://reset-password?token=t1&email=ivan%40example.com`)
    ).toEqual({ path: '/reset-password', query: { token: 't1', email: 'ivan@example.com' } })
  })

  it('своя схема: подтверждение почты со статусом', () => {
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://verify-email?status=verified`)).toEqual({
      path: '/verify-email',
      query: { status: 'verified' },
    })
  })

  it('своя схема с пустым host (три слэша) тоже разбирается', () => {
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}:///reset-password?token=t2`)).toEqual({
      path: '/reset-password',
      query: { token: 't2' },
    })
  })

  it('App Link: сброс пароля по https-ссылке из письма', () => {
    expect(parseDeepLink(`https://${HOST}/app/reset?token=t3&email=a%40b.ru`)).toEqual({
      path: '/reset-password',
      query: { token: 't3', email: 'a@b.ru' },
    })
  })

  it('App Link: результат подтверждения почты', () => {
    expect(parseDeepLink(`https://${HOST}/app/verified?status=invalid`)).toEqual({
      path: '/verify-email',
      query: { status: 'invalid' },
    })
  })

  it('пустые параметры не попадают в query', () => {
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://reset-password?token=t4&email=`)).toEqual({
      path: '/reset-password',
      query: { token: 't4' },
    })
  })

  it('чужие ссылки не открываем в приложении', () => {
    // https-ссылка вне префикса `/app` — это обычная страница бэкенда.
    expect(parseDeepLink(`https://${HOST}/api/forgot-password`)).toBeNull()
    expect(parseDeepLink(`https://${HOST}/`)).toBeNull()
    // Незнакомая ветка внутри `/app`.
    expect(parseDeepLink(`https://${HOST}/app/unknown`)).toBeNull()
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://unknown?x=1`)).toBeNull()
    // Другая схема.
    expect(parseDeepLink('https://example.com/app/reset?token=t5')).toEqual({
      path: '/reset-password',
      query: { token: 't5' },
    })
    expect(parseDeepLink('myapp://reset-password?token=t5')).toBeNull()
  })

  it('мусор и пустое значение не роняют разбор', () => {
    expect(parseDeepLink('')).toBeNull()
    expect(parseDeepLink('   ')).toBeNull()
    expect(parseDeepLink('не ссылка вовсе')).toBeNull()
    expect(parseDeepLink(undefined)).toBeNull()
    expect(parseDeepLink(null)).toBeNull()
    expect(parseDeepLink(42)).toBeNull()
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://`)).toBeNull()
  })
})
