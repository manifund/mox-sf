import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  subRetrieve: vi.fn(),
  subList: vi.fn(),
  custRetrieve: vi.fn(),
  find: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  discord: vi.fn(),
  removeDoor: vi.fn(),
}))
vi.mock('@/app/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: m.subRetrieve, list: m.subList },
    customers: { retrieve: m.custRetrieve },
  },
}))
vi.mock('@/app/lib/airtable', () => ({
  Tables: { People: 'People' },
  findRecord: m.find,
  getRecord: m.get,
  createRecord: m.create,
  updateRecord: m.update,
  escapeAirtableString: (s: string) => s,
}))
vi.mock('@/app/lib/discord', () => ({
  sendChannelMessage: m.discord,
  DISCORD_CHANNELS: { NOTIFICATIONS: 'staff', NEW_MEMBERS: 'welcome' },
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: m.send }
  },
}))
vi.mock('@/app/lib/verkada', () => ({ removeMemberDoorAccess: m.removeDoor }))
vi.mock('@/app/lib/forkable', () => ({
  FORKABLE_CLUBS: { MOX_MEMBERS: 1, MOX_RESIDENTS: 2 },
}))

import {
  handleMembershipCheckout,
  handlePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  resolveTier,
} from './stripe-membership'

const RECORD_ID = 'recABCDEFGHIJKLMN'
const CORE = 'prod_RpkYg9EMJoi5oi'
const RESIDENT = 'prod_RpkufjD9E3esG5'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const subscription = (over: Record<string, unknown> = {}): Any => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'trialing',
  metadata: { tier: 'Core', interval: 'monthly' },
  items: { data: [{ price: { product: { id: CORE } } }] },
  ...over,
})

const session = (over: Record<string, unknown> = {}): Any => ({
  id: 'cs_1',
  mode: 'subscription',
  customer: 'cus_1',
  subscription: 'sub_1',
  client_reference_id: RECORD_ID,
  customer_details: { email: 'new@example.com', name: 'New Member' },
  ...over,
})

const person = (fields: Record<string, unknown> = {}): Any => ({
  id: RECORD_ID,
  fields: {
    Name: 'New Member',
    Email: 'new@example.com',
    Status: 'Invited',
    ...fields,
  },
})

const staffMessages = () =>
  m.discord.mock.calls.filter((c) => c[0] === 'staff').map((c) => String(c[1]))

beforeEach(() => {
  vi.resetAllMocks()
  m.subRetrieve.mockResolvedValue(subscription())
  m.subList.mockResolvedValue({ data: [] })
  m.get.mockResolvedValue(person())
  m.find.mockResolvedValue(null)
  m.create.mockResolvedValue({ id: 'recNEWNEWNEWNEWNE', fields: {} })
  m.update.mockResolvedValue({ id: RECORD_ID, fields: {} })
  m.send.mockResolvedValue({ data: { id: 'email' }, error: null })
  m.discord.mockResolvedValue({ success: true })
  m.removeDoor.mockResolvedValue({ ok: true })
})

describe('resolveTier', () => {
  it('prefers the tier written by membership checkout over the product', () => {
    expect(
      resolveTier(
        subscription({
          metadata: { tier: 'Resident' },
          items: { data: [{ price: { product: { id: CORE } } }] },
        })
      )
    ).toBe('Resident')
  })
  it('falls back to the Stripe product and rejects unknown ones', () => {
    expect(resolveTier(subscription({ metadata: {} }))).toBe('Core')
    expect(
      resolveTier(
        subscription({
          metadata: {},
          items: { data: [{ price: { product: 'prod_unknown' } }] },
        })
      )
    ).toBeNull()
  })
})

describe('handleMembershipCheckout', () => {
  it('marks the invited person Joined, emails them, and posts to Discord', async () => {
    const result = await handleMembershipCheckout(session())
    expect(result).toEqual({
      personId: RECORD_ID,
      tier: 'Core',
      skipped: false,
    })
    expect(m.get).toHaveBeenCalledWith('People', RECORD_ID)
    expect(m.update).toHaveBeenCalledWith('People', RECORD_ID, {
      Status: 'Joined',
      Tier: 'Core',
      'Stripe Customer ID': 'cus_1',
    })
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        subject: 'Thanks for joining Mox!',
      })
    )
    expect(m.discord).toHaveBeenCalledWith(
      'welcome',
      expect.stringContaining('New Member just started their Mox membership')
    )
    expect(staffMessages()[0]).toContain('Joined, Core')
  })

  it('uses the Stripe product for the tier when checkout metadata is missing', async () => {
    m.subRetrieve.mockResolvedValue(
      subscription({
        metadata: {},
        items: { data: [{ price: { product: { id: RESIDENT } } }] },
      })
    )
    await handleMembershipCheckout(session())
    expect(m.update).toHaveBeenCalledWith(
      'People',
      RECORD_ID,
      expect.objectContaining({ Tier: 'Resident' })
    )
  })

  it('is idempotent: a record that already reflects the subscription sends nothing', async () => {
    m.get.mockResolvedValue(
      person({ Status: 'Joined', Tier: 'Core', 'Stripe Customer ID': 'cus_1' })
    )
    const result = await handleMembershipCheckout(session())
    expect(result?.skipped).toBe(true)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
    expect(m.discord).not.toHaveBeenCalled()
  })

  it('falls back to an email match, then creates a person, when no record id is passed', async () => {
    await handleMembershipCheckout(session({ client_reference_id: null }))
    expect(m.get).not.toHaveBeenCalled()
    expect(m.find).toHaveBeenCalledWith(
      'People',
      'LOWER({Email})="new@example.com"'
    )
    expect(m.create).toHaveBeenCalledWith('People', {
      Name: 'New Member',
      Email: 'new@example.com',
    })
    expect(m.update).toHaveBeenCalledWith(
      'People',
      'recNEWNEWNEWNEWNE',
      expect.objectContaining({ Status: 'Joined', Name: 'New Member' })
    )

    vi.clearAllMocks()
    m.find.mockResolvedValue(person({ id: 'recEXISTINGEXISTS' }))
    await handleMembershipCheckout(session({ client_reference_id: null }))
    expect(m.create).not.toHaveBeenCalled()
  })

  it('alerts staff and leaves Airtable alone for an unknown product', async () => {
    m.subRetrieve.mockResolvedValue(
      subscription({
        metadata: {},
        items: { data: [{ price: { product: { id: 'prod_mystery' } } }] },
      })
    )
    expect(await handleMembershipCheckout(session())).toBeNull()
    expect(m.update).not.toHaveBeenCalled()
    expect(m.send).not.toHaveBeenCalled()
    expect(staffMessages()[0]).toContain('unknown product')
  })

  it('throws before touching Airtable when the email provider rejects', async () => {
    m.send.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    await expect(handleMembershipCheckout(session())).rejects.toThrow(
      'rate limited'
    )
    expect(m.update).not.toHaveBeenCalled()
  })

  it('ignores one-off (day pass) checkout sessions', async () => {
    expect(
      await handleMembershipCheckout(session({ mode: 'payment' }))
    ).toBeNull()
    expect(m.subRetrieve).not.toHaveBeenCalled()
  })

  it('flags a mismatch between the checkout email and the Airtable email', async () => {
    m.get.mockResolvedValue(person({ Email: 'typo@example.com' }))
    await handleMembershipCheckout(session())
    expect(staffMessages()[0]).toContain('differs from the Airtable email')
  })
})

describe('handlePaymentFailed', () => {
  const invoice = (over: Record<string, unknown> = {}): Any => ({
    customer: 'cus_1',
    parent: { subscription_details: { subscription: 'sub_1' } },
    customer_email: 'new@example.com',
    customer_name: 'New Member',
    amount_due: 59500,
    currency: 'usd',
    attempt_count: 1,
    next_payment_attempt: 1_800_000_000,
    ...over,
  })

  it('tells staff and changes nothing in Airtable', async () => {
    m.find.mockResolvedValue(person({ Status: 'Joined' }))
    await handlePaymentFailed(invoice())
    const msg = staffMessages()[0]
    expect(msg).toContain('Payment failed')
    expect(msg).toContain('$595')
    expect(msg).toContain('attempt 1')
    expect(msg).toContain('Stripe retries on')
    expect(m.update).not.toHaveBeenCalled()
  })

  it('ignores invoices that are not for a subscription', async () => {
    await handlePaymentFailed(invoice({ parent: null }))
    expect(m.discord).not.toHaveBeenCalled()
  })
})

describe('handleSubscriptionUpdated', () => {
  it('moves a member to Payment Issue and pulls door access when Stripe gives up', async () => {
    m.find.mockResolvedValue(person({ Status: 'Joined' }))
    await handleSubscriptionUpdated(subscription({ status: 'unpaid' }), {
      status: 'past_due',
    })
    expect(m.update).toHaveBeenCalledWith('People', RECORD_ID, {
      Status: 'Payment Issue',
      'In Verkada': false,
    })
    expect(m.removeDoor).toHaveBeenCalledWith('new@example.com')
    expect(staffMessages()[0]).toContain('Payment Issue')
    expect(staffMessages()[0]).toContain('Door access removed')
  })

  it('restores Joined when a Payment Issue member pays', async () => {
    m.find.mockResolvedValue(person({ Status: 'Payment Issue' }))
    await handleSubscriptionUpdated(subscription({ status: 'active' }), {
      status: 'unpaid',
    })
    expect(m.update).toHaveBeenCalledWith('People', RECORD_ID, {
      Status: 'Joined',
    })
    expect(staffMessages()[0]).toContain('Payment recovered')
  })

  it('does not resurrect a Cancelled member on an unrelated status change', async () => {
    m.find.mockResolvedValue(person({ Status: 'Cancelled' }))
    await handleSubscriptionUpdated(subscription({ status: 'active' }), {
      status: 'past_due',
    })
    expect(m.update).not.toHaveBeenCalled()
  })

  it('ignores updates that do not change the status', async () => {
    await handleSubscriptionUpdated(subscription({ status: 'active' }), {
      metadata: { interval: 'quarterly' },
    })
    await handleSubscriptionUpdated(
      subscription({ status: 'active' }),
      undefined
    )
    expect(m.find).not.toHaveBeenCalled()
    expect(m.discord).not.toHaveBeenCalled()
  })

  it('tells staff when no Airtable record carries the customer id', async () => {
    await handleSubscriptionUpdated(subscription({ status: 'unpaid' }), {
      status: 'past_due',
    })
    expect(m.update).not.toHaveBeenCalled()
    expect(staffMessages()[0]).toContain('no Airtable record')
  })

  it('still lapses the membership when Verkada removal fails, and says so', async () => {
    m.find.mockResolvedValue(person({ Status: 'Joined' }))
    m.removeDoor.mockResolvedValue({
      ok: false,
      error: 'Verkada responded 403',
    })
    await handleSubscriptionUpdated(subscription({ status: 'unpaid' }), {
      status: 'past_due',
    })
    expect(m.update).toHaveBeenCalled()
    expect(staffMessages()[0]).toContain('NOT removed')
  })
})

describe('handleSubscriptionDeleted', () => {
  it('marks the member Cancelled when it was their only live subscription', async () => {
    m.subList.mockResolvedValue({ data: [{ id: 'sub_1', status: 'canceled' }] })
    m.find.mockResolvedValue(person({ Status: 'Joined' }))
    await handleSubscriptionDeleted(subscription({ status: 'canceled' }))
    expect(m.subList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', status: 'all' })
    )
    expect(m.update).toHaveBeenCalledWith('People', RECORD_ID, {
      Status: 'Cancelled',
      'In Verkada': false,
    })
    expect(m.removeDoor).toHaveBeenCalledWith('new@example.com')
  })

  it('leaves the member alone when another subscription is still live', async () => {
    m.subList.mockResolvedValue({ data: [{ id: 'sub_2', status: 'active' }] })
    await handleSubscriptionDeleted(subscription({ status: 'canceled' }))
    expect(m.find).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })
})
