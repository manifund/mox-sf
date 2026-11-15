import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolvePin = vi.fn()
const refreshPinIndex = vi.fn()
const userUnlockDoor = vi.fn()
const sendChannelMessage = vi.fn()
const afterCallbacks: Array<() => unknown> = []

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    afterCallbacks.push(callback)
  },
}))
vi.mock('@/app/lib/door-pins', () => ({
  PIN_PATTERN: /^\d{4,16}$/,
  resolvePin,
  refreshPinIndex,
}))
vi.mock('@/app/lib/verkada', () => ({ userUnlockDoor }))
vi.mock('@/app/lib/discord', () => ({
  sendChannelMessage,
  DISCORD_CHANNELS: { NOTIFICATIONS: 'notifications' },
}))
const store = new Map<string, unknown>()
vi.mock('@/app/lib/door-store', () => ({
  storeGet: async (key: string) => store.get(key) ?? null,
  storeSet: async (key: string, value: unknown) => {
    store.set(key, structuredClone(value))
  },
}))

let POST: typeof import('./route').POST

function attempt(pin: unknown, ip = '1.2.3.4') {
  return POST(
    new Request('https://moxsf.com/door/api/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ pin }),
    })
  )
}

beforeEach(async () => {
  vi.resetModules()
  store.clear()
  afterCallbacks.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  resolvePin.mockResolvedValue({ match: null, indexAgeMs: 0 })
  refreshPinIndex.mockResolvedValue(undefined)
  userUnlockDoor.mockResolvedValue({ ok: true })
  ;({ POST } = await import('./route'))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('POST /door/api/unlock', () => {
  it('unlocks as the user who owns the code', async () => {
    resolvePin.mockResolvedValue({
      match: { userId: 'u-ada', name: 'Ada' },
      indexAgeMs: 0,
    })
    const res = await attempt('482913')
    expect(await res.json()).toEqual({ success: true })
    expect(userUnlockDoor).toHaveBeenCalledWith('u-ada')
  })

  it('does not touch the door for a wrong code', async () => {
    const res = await attempt('000000')
    expect(await res.json()).toEqual({
      success: false,
      reason: 'rejected',
      attemptsLeft: 4,
    })
    expect(userUnlockDoor).not.toHaveBeenCalled()
  })

  it('rejects anything that is not 4 to 16 digits without looking it up', async () => {
    for (const pin of ['123', '12a456', '', null, 123456, '1'.repeat(17)]) {
      const res = await attempt(pin)
      expect(res.status).toBe(400)
    }
    expect(resolvePin).not.toHaveBeenCalled()
  })

  it('pauses an address after five wrong codes, even for a right one', async () => {
    for (let i = 0; i < 5; i++) await attempt('000000')
    resolvePin.mockResolvedValue({
      match: { userId: 'u-ada', name: 'Ada' },
      indexAgeMs: 0,
    })
    const res = await attempt('482913')
    expect(res.status).toBe(429)
    expect((await res.json()).reason).toBe('locked')
    expect(userUnlockDoor).not.toHaveBeenCalled()
  })

  it('closes for everyone and alerts Discord once after 20 wrong codes', async () => {
    for (let i = 0; i < 20; i++) await attempt('000000', `10.0.0.${i}`)
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]()
    expect(sendChannelMessage).toHaveBeenCalledTimes(1)

    const res = await attempt('482913', '99.99.99.99')
    expect(res.status).toBe(429)
    expect(resolvePin).toHaveBeenCalledTimes(20)
  })

  it('counts wrong codes sent in parallel', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => attempt('000000'))
    )
    const statuses = results.map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(5)
    expect(statuses.filter((s) => s === 429)).toHaveLength(3)
  })

  it('reports a Verkada refusal as denied, without counting it as a guess', async () => {
    resolvePin.mockResolvedValue({
      match: { userId: 'u-guest', name: 'Gus' },
      indexAgeMs: 0,
    })
    userUnlockDoor.mockResolvedValue({ ok: false, status: 403, message: 'no' })
    for (let i = 0; i < 6; i++) {
      const res = await attempt('771204')
      expect(await res.json()).toEqual({ success: false, reason: 'denied' })
    }
  })

  it('reports an outage as an error, not a wrong code', async () => {
    resolvePin.mockRejectedValue(new Error('verkada down'))
    const res = await attempt('482913')
    expect(res.status).toBe(502)
    expect((await res.json()).reason).toBe('error')

    resolvePin.mockResolvedValue({
      match: { userId: 'u-ada', name: 'Ada' },
      indexAgeMs: 0,
    })
    userUnlockDoor.mockResolvedValue({ ok: false, status: 500, message: '' })
    expect((await attempt('482913')).status).toBe(502)
  })

  it('refreshes an old index in the background after a match', async () => {
    resolvePin.mockResolvedValue({
      match: { userId: 'u-ada', name: 'Ada' },
      indexAgeMs: 6 * 60 * 1000,
    })
    await attempt('482913')
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]()
    expect(refreshPinIndex).toHaveBeenCalled()
  })
})
