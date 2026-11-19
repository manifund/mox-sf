import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const m = vi.hoisted(() => ({
  event: vi.fn(), lines: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(),
  magic: vi.fn(), send: vi.fn(), sub: vi.fn(), subs: vi.fn(), discord: vi.fn(),
  get: vi.fn(), findAll: vi.fn(),
}))
vi.mock('@/app/lib/stripe', () => ({ stripe: {
  webhooks: { constructEvent: m.event }, checkout: { sessions: { listLineItems: m.lines } },
  subscriptions: { retrieve: m.sub, list: m.subs },
} }))
vi.mock('resend', () => ({ Resend: class { emails = { send: m.send } } }))
vi.mock('@/app/lib/airtable', () => ({
  Tables: { People: 'People', DayPasses: 'Day Passes' },
  findRecord: m.find, createRecord: m.create, updateRecord: m.update,
  getRecord: m.get, findRecords: m.findAll,
  escapeAirtableString: (s: string) => s,
}))
vi.mock('@/app/lib/magic-link', () => ({ createMagicLink: m.magic }))
vi.mock('@/app/lib/discord', () => ({ sendChannelMessage: m.discord, DISCORD_CHANNELS: { NOTIFICATIONS: 'staff' } }))
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

describe('subscription changes sync to Airtable', () => {
  const stripeSub = (over = {}) => ({
    id: 'sub_1', customer: 'cus_1', status: 'active', pause_collection: null,
    items: { data: [{ price: { product: 'prod_RpkYg9EMJoi5oi' } }] }, ...over,
  })
  const member = (fields: Record<string, string>) =>
    m.find.mockResolvedValue({ id: 'recMember', fields: { Name: 'Member', ...fields } })
  beforeEach(() => {
    m.event.mockReturnValue({ type: 'customer.subscription.updated', data: {
      object: { id: 'sub_1' }, previous_attributes: { items: {} },
    } })
    m.sub.mockResolvedValue(stripeSub())
  })
  it('moves a paused Friend who resumed onto Core to Joined Core', async () => {
    member({ Tier: 'Friend', Status: 'Paused' })
    expect((await POST(request())).status).toBe(200)
    expect(m.find).toHaveBeenCalledWith('People', '{Stripe Customer ID}="cus_1"')
    expect(m.update).toHaveBeenCalledWith('People', 'recMember', { Tier: 'Core', Status: 'Joined' })
  })
  it('marks a member Paused using the live subscription, not the event payload', async () => {
    member({ Tier: 'Core', Status: 'Joined' })
    m.sub.mockResolvedValue(stripeSub({ pause_collection: { behavior: 'void' } }))
    expect((await POST(request())).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith('People', 'recMember', { Status: 'Paused' })
  })
  it('writes nothing when Airtable already matches (e.g. a renewal)', async () => {
    member({ Tier: 'Core', Status: 'Joined' })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('ignores non-membership subscriptions without touching Airtable', async () => {
    m.sub.mockResolvedValue(stripeSub({ items: { data: [{ price: { product: 'prod_other' } }] } }))
    expect((await POST(request())).status).toBe(200)
    expect(m.find).not.toHaveBeenCalled()
  })
  it('returns 200 when no People record matches the customer', async () => {
    m.find.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('returns 500 when the Airtable write fails so Stripe retries', async () => {
    member({ Tier: 'Friend', Status: 'Paused' })
    m.update.mockRejectedValue(new Error('Airtable 403'))
    expect((await POST(request())).status).toBe(500)
  })
})

describe('payment failures and cancellations sync to Airtable', () => {
  const stripeSub = (over = {}) => ({
    id: 'sub_1', customer: 'cus_1', status: 'active', pause_collection: null,
    items: { data: [{ price: { product: 'prod_RpkYg9EMJoi5oi' } }] }, ...over,
  })
  const member = (fields: Record<string, string>) =>
    m.find.mockResolvedValue({ id: 'recMember', fields: { Name: 'Member', ...fields } })
  const updated = (previous: Record<string, unknown>) =>
    m.event.mockReturnValue({ type: 'customer.subscription.updated', data: {
      object: { id: 'sub_1' }, previous_attributes: previous,
    } })
  const deleted = () =>
    m.event.mockReturnValue({ type: 'customer.subscription.deleted', data: {
      object: stripeSub({ status: 'canceled' }),
    } })
  beforeEach(() => {
    m.discord.mockResolvedValue(true)
    m.subs.mockResolvedValue({ data: [] })
  })

  it('a first failed charge alerts staff but leaves Airtable alone', async () => {
    updated({ status: 'active' })
    m.sub.mockResolvedValue(stripeSub({ status: 'past_due' }))
    member({ Tier: 'Core', Status: 'Joined' })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.discord).toHaveBeenCalledWith('staff', expect.stringContaining('payment failed for Member'))
  })
  it('marks Payment Issue when Stripe gives up, and Joined again once paid', async () => {
    updated({ status: 'past_due' })
    m.sub.mockResolvedValue(stripeSub({ status: 'unpaid' }))
    member({ Tier: 'Core', Status: 'Joined' })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith('People', 'recMember', { Status: 'Payment Issue' })

    updated({ status: 'unpaid' })
    m.sub.mockResolvedValue(stripeSub())
    member({ Tier: 'Core', Status: 'Payment Issue' })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).toHaveBeenLastCalledWith('People', 'recMember', { Status: 'Joined' })
  })
  it('marks a member Cancelled when their subscription ends', async () => {
    deleted()
    member({ Tier: 'Core', Status: 'Joined' })
    expect((await POST(request())).status).toBe(200)
    expect(m.subs).toHaveBeenCalledWith({ customer: 'cus_1', limit: 20 })
    expect(m.update).toHaveBeenCalledWith('People', 'recMember', { Status: 'Cancelled' })
  })
  it('keeps a member whose cancelled subscription was replaced by another', async () => {
    deleted()
    member({ Tier: 'Core', Status: 'Joined' })
    m.subs.mockResolvedValue({ data: [stripeSub({ id: 'sub_2' })] })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('ignores the end of a non-membership subscription', async () => {
    m.event.mockReturnValue({ type: 'customer.subscription.deleted', data: {
      object: stripeSub({ status: 'canceled', items: { data: [{ price: { product: 'prod_other' } }] } }),
    } })
    expect((await POST(request())).status).toBe(200)
    expect(m.find).not.toHaveBeenCalled()
  })
  it('warns staff when a cancelled subscription matches no People record', async () => {
    deleted()
    m.find.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.discord).toHaveBeenCalledWith('staff', expect.stringContaining('cus_1'))
  })
  it('returns 500 when the cancellation write fails so Stripe retries', async () => {
    deleted()
    member({ Tier: 'Core', Status: 'Joined' })
    m.update.mockRejectedValue(new Error('Airtable 403'))
    expect((await POST(request())).status).toBe(500)
  })
})

describe('membership sign-ups link the person in Airtable', () => {
  const CORE = 'prod_RpkYg9EMJoi5oi'
  const signup = (over = {}) => ({ type: 'checkout.session.completed', data: { object: {
    id: 'cs_signup', mode: 'subscription', customer: 'cus_new', subscription: 'sub_new',
    client_reference_id: 'recAAAAAAAAAAAAAA',
    customer_details: { name: 'Casey', email: 'Casey@Example.com' }, ...over,
  } } })
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T20:00:00Z'))
    m.sub.mockResolvedValue({ id: 'sub_new', items: { data: [{ price: { product: CORE } }] } })
    m.update.mockResolvedValue({ id: 'recAAAAAAAAAAAAAA', fields: {} })
  })
  afterEach(() => vi.useRealTimers())

  it('links and tags a returning lapsed member by record id, without touching In Verkada', async () => {
    m.event.mockReturnValue(signup())
    m.get.mockResolvedValue({ id: 'recAAAAAAAAAAAAAA', fields: {
      'Stripe Customer ID': 'cus_old', Tags: ['Free Thru 2026: lapsed'], 'In Verkada': true,
    } })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith('People', 'recAAAAAAAAAAAAAA', {
      'Stripe Customer ID': 'cus_new',
      'Previous Stripe Customer IDs': 'cus_old',
      Tags: ['Free Thru 2026: lapsed', 'Free Core 2026: NEWBIES'],
    })
    expect(m.create).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
  })

  it('falls back to the checkout email when exactly one person has it', async () => {
    m.event.mockReturnValue(signup({ client_reference_id: null }))
    m.findAll.mockResolvedValue([{ id: 'recBBBBBBBBBBBBBB', fields: {} }])
    await POST(request())
    expect(m.findAll.mock.calls[0][1]).toContain('casey@example.com')
    expect(m.update).toHaveBeenCalledWith('People', 'recBBBBBBBBBBBBBB', {
      'Stripe Customer ID': 'cus_new', Tags: ['Free Core 2026: NEWBIES'],
    })
  })

  it('links nobody when two people share the checkout email', async () => {
    m.event.mockReturnValue(signup({ client_reference_id: null }))
    m.findAll.mockResolvedValue([{ id: 'rec1', fields: {} }, { id: 'rec2', fields: {} }])
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('ignores a subscription checkout for a non-membership product', async () => {
    m.event.mockReturnValue(signup())
    m.sub.mockResolvedValue({ id: 'sub_new', items: { data: [{ price: { product: 'prod_other' } }] } })
    await POST(request())
    expect(m.get).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })

  it('returns 500 when the Airtable write fails so Stripe retries', async () => {
    m.event.mockReturnValue(signup())
    m.get.mockResolvedValue({ id: 'recAAAAAAAAAAAAAA', fields: {} })
    m.update.mockRejectedValue(new Error('Airtable 503'))
    expect((await POST(request())).status).toBe(500)
  })
})
