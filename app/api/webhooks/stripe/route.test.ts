import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const m = vi.hoisted(() => ({
  event: vi.fn(), lines: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(),
  magic: vi.fn(), send: vi.fn(), sub: vi.fn(), subs: vi.fn(), discord: vi.fn(),
  subUpdate: vi.fn(), announce: vi.fn(),
}))
vi.mock('@/app/lib/stripe', () => ({ stripe: {
  webhooks: { constructEvent: m.event }, checkout: { sessions: { listLineItems: m.lines } },
  subscriptions: { retrieve: m.sub, list: m.subs, update: m.subUpdate },
} }))
vi.mock('resend', () => ({ Resend: class { emails = { send: m.send } } }))
vi.mock('@/app/lib/airtable', () => ({
  Tables: { People: 'People', DayPasses: 'Day Passes' },
  findRecord: m.find, createRecord: m.create, updateRecord: m.update,
  escapeAirtableString: (s: string) => s,
}))
vi.mock('@/app/lib/magic-link', () => ({ createMagicLink: m.magic }))
vi.mock('@/app/lib/new-member-announcement', () => ({ announceNewMember: m.announce }))
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

describe('membership checkout onboarding (was the Zapier Zap)', () => {
  const checkout = (over = {}) =>
    m.event.mockReturnValue({ type: 'checkout.session.completed', data: { object: {
      id: 'cs_sub', mode: 'subscription', subscription: 'sub_1', customer: 'cus_1',
      client_reference_id: 'recInvite00000001',
      customer_details: { name: 'New Member', email: 'New@Example.com' }, ...over,
    } } })
  const sub = (metadata = {}) => m.sub.mockResolvedValue({
    id: 'sub_1', metadata, items: { data: [{ price: { product: 'prod_RpkYg9EMJoi5oi' } }] },
  })
  beforeEach(() => { checkout(); sub() })

  it('marks the invited record Joined, emails, posts, then marks the subscription done', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith('People', 'recInvite00000001', {
      Status: 'Joined', Tier: 'Core', 'Stripe Customer ID': 'cus_1',
    })
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'New@Example.com', subject: 'Thanks for joining Mox!', replyTo: 'robin@moxsf.com',
    }))
    expect(m.announce).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'recInvite00000001' }))
    expect(m.subUpdate).toHaveBeenCalledWith('sub_1', { metadata: { onboardedAt: expect.any(String) } })
    expect(m.lines).not.toHaveBeenCalled()
  })
  it('without an invite record, updates the person with that email', async () => {
    checkout({ client_reference_id: null })
    m.find.mockResolvedValue({ id: 'recByEmail', fields: {} })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).toHaveBeenCalledWith('People', 'recByEmail', expect.objectContaining({ Status: 'Joined' }))
    expect(m.create).not.toHaveBeenCalled()
  })
  it('creates the person when no record has that email', async () => {
    checkout({ client_reference_id: null })
    m.find.mockResolvedValue(null)
    m.create.mockResolvedValue({ id: 'recNew', fields: {} })
    expect((await POST(request())).status).toBe(200)
    expect(m.create).toHaveBeenCalledWith('People', {
      Name: 'New Member', Email: 'New@Example.com',
      Status: 'Joined', Tier: 'Core', 'Stripe Customer ID': 'cus_1',
    })
    expect(m.announce).toHaveBeenCalledWith(expect.objectContaining({ recordId: 'recNew' }))
  })
  it('does nothing twice for an already-onboarded subscription', async () => {
    sub({ onboardedAt: '2026-11-21T00:00:00Z' })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
    expect(m.announce).not.toHaveBeenCalled()
  })
  it('skips non-membership subscriptions', async () => {
    m.sub.mockResolvedValue({ id: 'sub_1', metadata: {}, items: { data: [{ price: { product: 'prod_other' } }] } })
    expect((await POST(request())).status).toBe(200)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
  })
  it('returns 500 without marking done when the email is rejected, so Stripe retries', async () => {
    m.send.mockResolvedValue({ data: null, error: { message: 'nope' } })
    expect((await POST(request())).status).toBe(500)
    expect(m.subUpdate).not.toHaveBeenCalled()
  })
})
