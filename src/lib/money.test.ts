import { describe, expect, it } from 'vitest'
import {
  centsToDollarString,
  dollarStringToCents,
  formatCents,
} from '@/lib/money'

describe('money', () => {
  it('formats cents for the screen', () => {
    expect(formatCents(3000)).toBe('$30.00')
    expect(formatCents(5)).toBe('$0.05')
    expect(formatCents(-700)).toBe('-$7.00')
  })

  it('round-trips an editable amount', () => {
    expect(centsToDollarString(3000)).toBe('30.00')
    expect(dollarStringToCents('30.00')).toBe(3000)
  })

  it('accepts what a volunteer actually types', () => {
    expect(dollarStringToCents('30')).toBe(3000)
    expect(dollarStringToCents(' $30.50 ')).toBe(3050)
    expect(dollarStringToCents('0.05')).toBe(5)
  })

  it('rounds to whole cents instead of keeping a float', () => {
    expect(dollarStringToCents('10.005')).toBe(1001)
    expect(dollarStringToCents('1.115')).toBe(112)
  })

  it('reports nonsense as NaN', () => {
    expect(dollarStringToCents('')).toBeNaN()
    expect(dollarStringToCents('abc')).toBeNaN()
  })
})
