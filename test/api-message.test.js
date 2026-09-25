// test/api-message.test.js
//
// Фаза 16: сообщения об ошибках бэкенда — на русском. Ошибки валидации Laravel
// приходят на английском («The email field is required.»), а наши контроллеры уже
// отвечают по-русски — перевод должен уметь и то, и другое.
import { describe, expect, it } from 'vitest'
import { extractApiMessage, translateMessage } from 'src/utils/apiMessage.js'

describe('Фаза 16 сообщения об ошибках API', () => {
  it('русский текст контроллера проходит как есть', () => {
    expect(translateMessage('Пользователь с таким email не зарегистрирован.')).toBe(
      'Пользователь с таким email не зарегистрирован.'
    )
  })

  it('ошибки валидации Laravel переводятся', () => {
    expect(translateMessage('The email field is required.')).toBe('Укажите email.')
    expect(translateMessage('The password must be at least 6 characters.')).toBe(
      'Пароль: минимум 6 символов.'
    )
    expect(translateMessage('The password confirmation does not match.')).toBe(
      'Пароли не совпадают.'
    )
    expect(translateMessage('The email has already been taken.')).toBe(
      'Такой email уже зарегистрирован.'
    )
    expect(translateMessage('The email must be a valid email address.')).toBe('Некорректный email.')
  })

  it('незнакомый английский текст не выдумываем', () => {
    expect(translateMessage('Some totally unknown english text.')).toBeNull()
    expect(translateMessage('')).toBeNull()
    expect(translateMessage(undefined)).toBeNull()
  })

  it('extractApiMessage собирает ошибки валидации в одну строку', () => {
    const error = {
      response: {
        status: 422,
        data: {
          errors: {
            email: ['The email field is required.'],
            password: ['The password must be at least 6 characters.'],
          },
        },
      },
    }

    expect(extractApiMessage(error)).toBe('Укажите email. Пароль: минимум 6 символов.')
  })

  it('extractApiMessage берёт message ответа, если ошибок валидации нет', () => {
    const error = {
      response: {
        status: 404,
        data: { message: 'Пользователь с таким email не зарегистрирован.' },
      },
    }

    expect(extractApiMessage(error)).toBe('Пользователь с таким email не зарегистрирован.')
  })

  it('extractApiMessage подсказывает по статусу, когда тело ответа пустое', () => {
    expect(extractApiMessage({ response: { status: 429, data: {} } })).toBe(
      'Слишком много попыток. Попробуйте позже.'
    )
  })

  it('extractApiMessage без ответа объясняет проблему с сетью, а не показывает «Network Error»', () => {
    expect(extractApiMessage(new Error('Network Error'))).toBe(
      'Нет соединения с сервером. Проверьте интернет-соединение.'
    )
  })
})
