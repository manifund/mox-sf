import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const m = vi.hoisted(() => ({
  event: vi.fn(), lines: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(),
  magic: vi.fn(), send: vi.fn(),
  subs: vi.fn(), customer: vi.fn(), offboard: vi.fn(), discord: vi.fn(),
}))
vi.mock('@/app/lib/stripe', () => ({ stripe: {
  webhooks: { constructEvent: m.event }, checkout: { sessions: { listLineItems: m.lines } },
  subscriptions: { list: m.subs }, customers: { retrieve: m.customer },
} }))
vi.mock('resend', () => ({ Resend: class { emails = { send: m.send } } }))
vi.mock('@/app/lib/airtable', () => ({
  Tables: { People: 'People', DayPasses: 'Day Passes' },
  findRecord: m.find, createRecord: m.create, updateRecord: m.update,
  escapeAirtableString: (s: string) => s,
}))
vi.mock('@/app/lib/magic-link', () => ({ createMagicLink: m.magic }))
vi.mock('@/app/lib/discord', () => ({ sendChannelMessage: m.discord, DISCORD_CHANNELS: { NOTIFICATIONS: 'chan' } }))
vi.mock('@/app/lib/forkable', () => ({
  addMemberToForkable: vi.fn(), parseFullName: vi.fn(),
  FORKABLE_CLUBS: { MOX_MEMBERS: 6314, MOX_RESIDENTS: 7097 },
}))
vi.mock('@/app/lib/forkable-offboard', () => ({
  offboardFromForkable: m.offboard,
  describeOffboardResult: (r: { outcome: string; email: string }) => `${r.outcome}:${r.email}`,
}))
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

describe('ended membership subscription', () => {
  const CORE = 'prod_RpkYg9EMJoi5oi'
  const FRIEND = 'prod_Rq9VzfM9QoJwPD'
  const ended = (product: string) => ({ type: 'customer.subscription.deleted', data: { object: {
    id: 'sub_old', status: 'canceled', customer: 'cus_1',
    items: { data: [{ price: { id: 'price_1', product } }] },
  } } })
  beforeEach(() => {
    m.event.mockReturnValue(ended(CORE))
    m.subs.mockResolvedValue({ data: [{ id: 'sub_old', status: 'canceled' }] })
    m.customer.mockResolvedValue({ id: 'cus_1', email: 'ada@example.com' })
    m.offboard.mockResolvedValue({ email: 'ada@example.com', outcome: 'removed' })
    m.discord.mockResolvedValue(true)
  })
  it('removes the member from Forkable once nothing is left in Stripe', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(m.subs).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 100 })
    expect(m.offboard).toHaveBeenCalledWith('ada@example.com', { stripeSubscriptionEnded: true })
    expect(m.discord).toHaveBeenCalledWith('chan', 'removed:ada@example.com')
  })
  it.each(['active', 'trialing', 'past_due', 'paused'])(
    'keeps the member while another subscription is %s', async (status) => {
      m.subs.mockResolvedValue({ data: [{ id: 'sub_old', status: 'canceled' }, { id: 'sub_new', status }] })
      expect((await POST(request())).status).toBe(200)
      expect(m.offboard).not.toHaveBeenCalled()
    })
  it('ignores subscriptions that never came with Forkable', async () => {
    for (const product of [FRIEND, 'prod_T5NXc8MwPn1ZIl', 'prod_unknown']) {
      m.event.mockReturnValue(ended(product))
      expect((await POST(request())).status).toBe(200)
    }
    expect(m.subs).not.toHaveBeenCalled()
    expect(m.offboard).not.toHaveBeenCalled()
  })
  it('alerts staff when Forkable refuses, and stays quiet when the member is kept', async () => {
    m.offboard.mockResolvedValueOnce({ email: 'ada@example.com', outcome: 'failed', errors: ['boom'] })
    await POST(request())
    expect(m.discord).toHaveBeenCalledWith('chan', 'failed:ada@example.com')
    m.discord.mockClear()
    m.offboard.mockResolvedValueOnce({ email: 'ada@example.com', outcome: 'skipped', reason: 'Private Office' })
    await POST(request())
    expect(m.discord).not.toHaveBeenCalled()
  })
  it('does nothing for a customer without an email', async () => {
    m.customer.mockResolvedValue({ id: 'cus_1', deleted: true })
    expect((await POST(request())).status).toBe(200)
    expect(m.offboard).not.toHaveBeenCalled()
  })
})
