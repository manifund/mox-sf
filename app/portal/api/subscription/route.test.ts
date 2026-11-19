import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ member: vi.fn(), list: vi.fn(), customer: vi.fn(), portal: vi.fn() }))
vi.mock('@/app/lib/session-member', () => ({ getSessionMember: m.member }))
vi.mock('@/app/lib/env', () => ({ env: { NEXT_PUBLIC_BASE_URL: 'https://moxsf.com' } }))
vi.mock('@/app/lib/stripe', () => ({ stripe: {
  subscriptions: { list: m.list },
  customers: { retrieve: m.customer },
  billingPortal: { sessions: { create: m.portal } },
} }))

import { GET } from './route'
import { POST as openBilling } from '../create-billing-session/route'

beforeEach(() => {
  vi.resetAllMocks()
  m.list.mockResolvedValue({ data: [] })
  m.customer.mockResolvedValue({ id: 'cus_mine', email: 'me@example.com' })
  m.portal.mockResolvedValue({ url: 'https://billing.stripe.com/session' })
})

describe('portal billing routes only ever use your own Stripe customer', () => {
  it('subscription lookup ignores a customer id sent by the browser', async () => {
    m.member.mockResolvedValue({ recordId: 'recMine', email: null, stripeCustomerId: 'cus_mine' })
    await GET()
    expect(m.list).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_mine' }))
  })

  it('billing page opens for the session member, not a posted id', async () => {
    m.member.mockResolvedValue({ recordId: 'recMine', email: null, stripeCustomerId: 'cus_mine' })
    const response = await openBilling()
    expect(response.status).toBe(200)
    expect(m.portal).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_mine' }))
  })

  it('refuses when not logged in or when the record has no customer', async () => {
    m.member.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect((await openBilling()).status).toBe(401)
    m.member.mockResolvedValue({ recordId: 'recMine', email: null, stripeCustomerId: null })
    expect((await GET()).status).toBe(400)
    expect((await openBilling()).status).toBe(400)
    expect(m.list).not.toHaveBeenCalled()
    expect(m.portal).not.toHaveBeenCalled()
  })
})
