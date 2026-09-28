import { describe, expect, it } from 'vitest'
import { stockStatus, stockTone } from '@/lib/what-to-buy'

describe('stockStatus', () => {
  it('says how many sale days are covered', () => {
    expect(stockStatus(0)).toBe('Runs out next sale')
    expect(stockStatus(0.9)).toBe('Runs out next sale')
    expect(stockStatus(1)).toBe('About 1 sale day left')
    expect(stockStatus(1.9)).toBe('About 1 sale day left')
    expect(stockStatus(2)).toBe('Covered for 2+ sale days')
    expect(stockStatus(9)).toBe('Covered for 2+ sale days')
  })

  it('does not guess before the first sale day is finished', () => {
    expect(stockStatus(null)).toBe('No finished sale days yet')
  })
})

describe('stockTone', () => {
  it('turns red only when it runs out next sale', () => {
    expect(stockTone(0.5)).toBe('bad')
    expect(stockTone(1.5)).toBe('warn')
    expect(stockTone(3)).toBe('ok')
    expect(stockTone(null)).toBe('warn')
  })
})
