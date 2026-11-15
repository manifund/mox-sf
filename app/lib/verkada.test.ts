import { describe, expect, it } from 'vitest'
import { generateEntryCode } from './verkada'

describe('generateEntryCode', () => {
  it('makes six-digit codes with no leading zero', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateEntryCode()
      expect(code).toMatch(/^[1-9]\d{5}$/)
    }
  })
  it('honours the requested length', () => {
    expect(generateEntryCode(4)).toMatch(/^[1-9]\d{3}$/)
  })
  it('does not repeat itself (in practice)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateEntryCode()))
    expect(codes.size).toBeGreaterThan(45)
  })
})
