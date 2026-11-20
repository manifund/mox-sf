import { describe, expect, it } from 'vitest'
import { generateEntryCode, isTransientStatus } from './verkada'

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

describe('isTransientStatus', () => {
  it('retries server errors and rate limits only', () => {
    expect(isTransientStatus(500)).toBe(true)
    expect(isTransientStatus(503)).toBe(true)
    expect(isTransientStatus(429)).toBe(true)
    expect(isTransientStatus(400)).toBe(false)
    expect(isTransientStatus(404)).toBe(false)
  })
})
