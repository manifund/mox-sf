import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const m = vi.hoisted(() => ({
  event: vi.fn(), lines: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(),
  magic: vi.fn(), send: vi.fn(),
  membership: vi.fn(), paymentFailed: vi.fn(), subUpdated: vi.fn(), subDeleted: vi.fn(),
  alert: vi.fn(),
}))
vi.mock('@/app/lib/stripe-membership', () => ({
  MEMBERSHIP_PRODUCTS: {},
  handleMembershipCheckout: m.membership,
  handlePaymentFailed: m.paymentFailed,
  handleSubscriptionUpdated: m.subUpdated,
  handleSubscriptionDeleted: m.subDeleted,
  alertWebhookFailure: m.alert,
}))
vi.mock('@/app/lib/stripe', () => ({ stripe: {
  webhooks: { constructEvent: m.event }, checkout: { sessions: { listLineItems: m.lines } },
} }))
vi.mock('resend', () => ({ Resend: class { emails = { send: m.send } } }))
vi.mock('@/app/lib/airtable', () => ({
  Tables: { People: 'People', DayPasses: 'Day Passes' },
  findRecord: m.find, createRecord: m.create, updateRecord: m.update,
  escapeAirtableString: (s: string) => s,
}))
vi.mock('@/app/lib/magic-link', () => ({ createMagicLink: m.magic }))
vi.mock('@/app/lib/discord', () => ({ sendChannelMessage: vi.fn(), DISCORD_CHANNELS: {} }))
vi.mock('@/app/lib/forkable', () => ({ addMemberToForkable: vi.fn(), FORKABLE_CLUBS: {}, parseFullName: vi.fn() }))
const request = () => new Request('https://moxsf.com/api/webhooks/stripe', {
  method: 'POST', headers: { 'stripe-signature': 'verified-by-mock' }, body: '{}',
})
const person = { id: 'person', fields: {} }
beforeEach(() => {
  vi.resetAllMocks()
  m.event.mockReturnValue({ type: 'checkout.session.completed', data: { object: {
    id: 'cs_paid', payment_intent: 'pi_paid',
    customer_details: { name: 'Buyer', email: 'buyer@example.com' },
  } } })
  m.lines.mockResolvedValue({ data: [{ price: { product: { id: 'prod_T5NXc8MwPn1ZIl' } } }] })
  m.find.mockImplementation(async (table: string) => table === 'People' ? person : null)
  m.create.mockResolvedValue({ id: 'pass', fields: {} })
  m.update.mockResolvedValue({ id: 'pass', fields: {} })
  m.magic.mockResolvedValue('https://moxsf.com/portal/verify?token=test')
  m.send.mockResolvedValue({ data: { id: 'email' }, error: null })
})
describe('paid day pass fulfillment', () => {
  it('returns 500 for rejected Airtable writes so Stripe retries', async () => {
    m.create.mockRejectedValue(new Error('Airtable 403'))
    expect((await POST(request())).status).toBe(500)
    expect(m.send).not.toHaveBeenCalled()
  })
  it('does not create an orphan pass when creating the person fails', async () => {
    m.find.mockResolvedValue(null)
    m.create.mockRejectedValue(new Error('Airtable 403'))
    expect((await POST(request())).status).toBe(500)
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.create.mock.calls[0][0]).toBe('People')
  })
  it('marks delivery only after the provider accepts the email', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(m.create).toHaveBeenCalledWith('Day Passes', expect.objectContaining({
      Name: 'cs_paid', User: ['person'], Notes: 'day-pass-activation:pending',
    }))
    expect(m.update).toHaveBeenCalledWith('Day Passes', 'pass', { Notes: 'day-pass-activation:sent' })
  })
  it('returns 500 on provider errors and resumes without issuing a second pass', async () => {
    m.send.mockResolvedValueOnce({ data: null, error: { message: 'temporarily unavailable' } })
    expect((await POST(request())).status).toBe(500)
    expect(m.update).not.toHaveBeenCalled()
    m.find.mockImplementation(async (table: string) => table === 'People' ? person : {
      id: 'pass', fields: { Notes: 'day-pass-activation:pending' },
    })
    expect((await POST(request())).status).toBe(200)
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.send).toHaveBeenCalledTimes(2)
  })
  it('resumes after token creation failed', async () => {
    m.magic.mockRejectedValueOnce(new Error('Airtable 403'))
    expect((await POST(request())).status).toBe(500)
    expect(m.send).not.toHaveBeenCalled()
    m.find.mockImplementation(async (table: string) => table === 'People' ? person : {
      id: 'pass', fields: { Notes: 'day-pass-activation:pending' },
    })
    expect((await POST(request())).status).toBe(200)
    expect(m.create).toHaveBeenCalledTimes(1)
  })
  it('deduplicates delivered and manually repaired passes by session or payment intent', async () => {
    m.find.mockResolvedValue({ id: 'pass', fields: { Notes: 'Restored from Stripe payment' } })
    expect((await POST(request())).status).toBe(200)
    expect(m.find).toHaveBeenCalledWith('Day Passes', 'OR({Name}="cs_paid",{Name}="pi_paid")')
    expect(m.create).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
  })
  it('rejects an invalid Stripe signature before touching Airtable', async () => {
    m.event.mockImplementation(() => { throw new Error('invalid signature') })
    expect((await POST(request())).status).toBe(400)
    expect(m.find).not.toHaveBeenCalled()
  })
})
describe('membership lifecycle dispatch', () => {
  const event = (type: string, object: Record<string, unknown>, previous_attributes?: Record<string, unknown>) =>
    m.event.mockReturnValue({ id: 'evt_1', type, data: { object, previous_attributes } })
  it('routes subscription checkouts to the membership handler, not day-pass fulfillment', async () => {
    event('checkout.session.completed', { id: 'cs_sub', mode: 'subscription' })
    expect((await POST(request())).status).toBe(200)
    expect(m.membership).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs_sub' }))
    expect(m.lines).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })
  it('returns 500 and alerts staff when the membership handler fails', async () => {
    event('checkout.session.completed', { id: 'cs_sub', mode: 'subscription' })
    m.membership.mockRejectedValue(new Error('Airtable 503'))
    expect((await POST(request())).status).toBe(500)
    expect(m.alert).toHaveBeenCalledWith('checkout.session.completed', 'evt_1', expect.any(Error))
  })
  it('passes previous_attributes to the subscription update handler', async () => {
    event('customer.subscription.updated', { id: 'sub_1', status: 'unpaid' }, { status: 'past_due' })
    expect((await POST(request())).status).toBe(200)
    expect(m.subUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unpaid' }), { status: 'past_due' },
    )
  })
  it('dispatches cancellations and failed payments, retrying on error', async () => {
    event('customer.subscription.deleted', { id: 'sub_1' })
    expect((await POST(request())).status).toBe(200)
    expect(m.subDeleted).toHaveBeenCalled()
    event('invoice.payment_failed', { id: 'in_1' })
    m.paymentFailed.mockRejectedValue(new Error('Discord down'))
    expect((await POST(request())).status).toBe(500)
    expect(m.alert).toHaveBeenCalledWith('invoice.payment_failed', 'evt_1', expect.any(Error))
  })
  it('does not alert for the Forkable step, which keeps its best-effort 200', async () => {
    event('customer.subscription.created', { id: 'sub_1', items: { data: [] } })
    expect((await POST(request())).status).toBe(200)
    expect(m.alert).not.toHaveBeenCalled()
  })
})
