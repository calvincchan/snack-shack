import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLiveValue } from '@/lib/live-value'

describe('useLiveValue', () => {
  it('follows the server while nothing is typed', () => {
    const { result, rerender } = renderHook(
      ({ server }) => useLiveValue(server),
      {
        initialProps: { server: 3 },
      },
    )
    rerender({ server: 5 })
    expect(result.current[0]).toBe(5)
  })

  it('keeps a local edit when the server changes underneath it', () => {
    const { result, rerender } = renderHook(
      ({ server }) => useLiveValue(server),
      {
        initialProps: { server: 3 },
      },
    )
    act(() => result.current[1](4))
    rerender({ server: 9 })
    expect(result.current[0]).toBe(4)
  })

  it('follows the server again once it catches up', () => {
    const { result, rerender } = renderHook(
      ({ server }) => useLiveValue(server),
      {
        initialProps: { server: 3 },
      },
    )
    act(() => result.current[1](4))
    rerender({ server: 4 })
    rerender({ server: 7 })
    expect(result.current[0]).toBe(7)
  })
})
