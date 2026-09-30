import { describe, expect, it } from 'vitest'
import { installMode } from '@/lib/install'

const base = {
  standalone: false,
  ios: false,
  hasPrompt: false,
  dismissed: false,
}

describe('installMode', () => {
  it('offers the install button when the browser has an install event', () => {
    expect(installMode({ ...base, hasPrompt: true })).toBe('prompt')
  })

  it('gives iPhone the Share-sheet steps, since it has no install event', () => {
    expect(installMode({ ...base, ios: true })).toBe('ios-hint')
  })

  it('offers nothing when the browser cannot install', () => {
    expect(installMode(base)).toBeNull()
  })

  it('stays quiet once installed or dismissed', () => {
    expect(
      installMode({ ...base, hasPrompt: true, standalone: true }),
    ).toBeNull()
    expect(installMode({ ...base, ios: true, standalone: true })).toBeNull()
    expect(
      installMode({ ...base, hasPrompt: true, dismissed: true }),
    ).toBeNull()
  })
})
