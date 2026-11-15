import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolvePin = vi.fn()
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
  refreshPinIndex: vi.fn(),
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

function attempt(pin: string, ip = '1.2.3.4') {
  return POST(
    new Request('https://moxsf.com/door/api/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ pin }),
    })
  )
}

const rightCode = {
  match: { userId: 'u-ada', name: 'Ada' },
  indexReady: true,
  indexAgeMs: 0,
}
const wrongCode = { match: null, indexReady: true, indexAgeMs: 0 }

beforeEach(async () => {
  vi.resetModules()
  store.clear()
  afterCallbacks.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  resolvePin.mockResolvedValue(wrongCode)
  userUnlockDoor.mockResolvedValue({ ok: true })
  ;({ POST } = await import('./route'))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// The page is public, so these limits are what stands between the door and
// someone guessing codes.
describe('POST /door/api/unlock wrong-code limits', () => {
  it('pauses an address after five wrong codes, even for a right one', async () => {
    for (let i = 0; i < 5; i++) await attempt('000000')
    resolvePin.mockResolvedValue(rightCode)

    const res = await attempt('482913')
    expect(res.status).toBe(429)
    expect((await res.json()).reason).toBe('locked')
    expect(userUnlockDoor).not.toHaveBeenCalled()

    // Another address is unaffected, and gets the door opened as the owner.
    const other = await attempt('482913', '5.6.7.8')
    expect(await other.json()).toEqual({ success: true })
    expect(userUnlockDoor.mock.calls[0][0]).toBe('u-ada')
  })

  it('closes for everyone and alerts Discord once after 20 wrong codes', async () => {
    for (let i = 0; i < 20; i++) await attempt('000000', `10.0.0.${i}`)
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]()
    expect(sendChannelMessage).toHaveBeenCalledTimes(1)

    resolvePin.mockResolvedValue(rightCode)
    const res = await attempt('482913', '99.99.99.99')
    expect(res.status).toBe(429)
    expect(userUnlockDoor).not.toHaveBeenCalled()
  })
})
