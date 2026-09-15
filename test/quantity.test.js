// test/quantity.test.js
//
// Задача 14.19: количество позиции — всегда целое ≥ 1. «Работа выполнена −3 раза»
// и «2.5 колеса» не существуют, поэтому правило применяется и в поле ввода, и в
// черновике заказа, и в локальной БД, и в payload синка (`utils/quantity.js`).
import { describe, expect, it } from 'vitest'

import { normalizeQuantity, normalizeQuantityInput } from 'src/utils/quantity.js'

describe('14.19 количество — целое ≥ 1', () => {
  it('normalizeQuantity: минус, ноль, пусто и мусор → 1, дробь → отбрасываем', () => {
    expect(normalizeQuantity(-3)).toBe(1)
    expect(normalizeQuantity('-3')).toBe(1)
    expect(normalizeQuantity(0)).toBe(1)
    expect(normalizeQuantity('0')).toBe(1)
    expect(normalizeQuantity('')).toBe(1)
    expect(normalizeQuantity(null)).toBe(1)
    expect(normalizeQuantity(undefined)).toBe(1)
    expect(normalizeQuantity('два колеса')).toBe(1)
    expect(normalizeQuantity(NaN)).toBe(1)
    expect(normalizeQuantity(Infinity)).toBe(1)

    expect(normalizeQuantity(2.9)).toBe(2)
    expect(normalizeQuantity('2.5')).toBe(2)
    expect(normalizeQuantity(3)).toBe(3)
    expect(normalizeQuantity('4')).toBe(4)
  })

  it('normalizeQuantityInput: пустое поле остаётся пустым (чтобы перенабрать цифру)', () => {
    expect(normalizeQuantityInput('')).toBe('')
    expect(normalizeQuantityInput(null)).toBe('')
    expect(normalizeQuantityInput(undefined)).toBe('')

    expect(normalizeQuantityInput('-3')).toBe(1)
    expect(normalizeQuantityInput('2.5')).toBe(2)
    expect(normalizeQuantityInput('7')).toBe(7)
  })
})
