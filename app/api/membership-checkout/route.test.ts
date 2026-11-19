import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  member: vi.fn(), prices: vi.fn(), create: vi.fn(), customer: vi.fn(),
}))
vi.mock('@/app/lib/session-member', () => ({ getSessionMember: m.member }))
vi.mock('@/app/lib/env', () => ({ env: { NEXT_PUBLIC_BASE_URL: 'https://moxsf.com' } }))
vi.mock('@/app/lib/stripe', () => ({ stripe: {
  prices: { list: m.prices },
  checkout: { sessions: { create: m.create } },
  customers: { retrieve: m.customer },
} }))

import { POST } from './route'

const post = (body: Record<string, unknown>) =>
  POST(new Request('https://moxsf.com/api/membership-checkout', {
    method: 'POST', body: JSON.stringify({ tier: 'core', interval: 'monthly', ...body }),
  }))
const sent = () => m.create.mock.calls[0][0]

beforeEach(() => {
  vi.resetAllMocks()
  m.prices.mockResolvedValue({ data: [{ id: 'price_core', unit_amount: 59500 }] })
  m.create.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay' })
  m.customer.mockResolvedValue({ id: 'cus_mine' })
})

describe('membership checkout: who gets billed', () => {
  it('reuses the logged-in member\'s existing Stripe customer and links their record', async () => {
    m.member.mockResolvedValue({ recordId: 'recMine', email: 'me@example.com', stripeCustomerId: 'cus_mine' })
    await post({ clientReferenceId: 'recSomeoneElse', email: 'other@example.com' })
    expect(sent()).toMatchObject({ customer: 'cus_mine', client_reference_id: 'recMine' })
    expect(sent().customer_email).toBeUndefined()
  })

  it('starts a fresh customer when the saved one no longer exists in Stripe', async () => {
    m.member.mockResolvedValue({ recordId: 'recMine', email: 'me@example.com', stripeCustomerId: 'cus_gone' })
    m.customer.mockRejectedValue(new Error('No such customer'))
    await post({})
    expect(sent().customer).toBeUndefined()
    expect(sent()).toMatchObject({ customer_email: 'me@example.com', client_reference_id: 'recMine' })
  })

  it('never reuses a customer for an anonymous /join request', async () => {
    m.member.mockResolvedValue(null)
    await post({ clientReferenceId: 'recInvited' })
    expect(sent().customer).toBeUndefined()
    expect(sent().client_reference_id).toBe('recInvited')
    expect(m.customer).not.toHaveBeenCalled()
  })

  it('still works when the session lookup itself fails', async () => {
    m.member.mockRejectedValue(new Error('Airtable down'))
    const response = await post({ email: 'new@example.com' })
    expect(response.status).toBe(200)
    expect(sent()).toMatchObject({ customer_email: 'new@example.com' })
  })
})
