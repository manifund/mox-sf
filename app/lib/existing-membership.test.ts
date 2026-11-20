import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  customersList: vi.fn(),
  customersRetrieve: vi.fn(),
  subsList: vi.fn(),
}))
vi.mock('./stripe', () => ({
  stripe: {
    customers: { list: m.customersList, retrieve: m.customersRetrieve },
    subscriptions: { list: m.subsList },
  },
}))

import { findExistingMembership } from './existing-membership'

const CORE = 'prod_RpkYg9EMJoi5oi'
const sub = (status: string, product = CORE) => ({
  status,
  items: { data: [{ price: { product } }] },
})

beforeEach(() => {
  vi.resetAllMocks()
  m.customersList.mockResolvedValue({ data: [] })
  m.subsList.mockResolvedValue({ data: [] })
  m.customersRetrieve.mockResolvedValue({ id: 'cus_x', deleted: false })
})

describe('findExistingMembership', () => {
  it('finds a live membership on the Airtable customer id', async () => {
    m.subsList.mockResolvedValue({ data: [sub('active')] })
    const result = await findExistingMembership({ customerIds: ['cus_air'] })
    expect(result).toEqual({ held: true, customerId: 'cus_air' })
  })

  it('finds a membership under the email when Airtable has no customer id', async () => {
    m.customersList.mockResolvedValue({ data: [{ id: 'cus_email' }] })
    m.subsList.mockResolvedValue({ data: [sub('trialing')] })
    const result = await findExistingMembership({
      customerIds: [undefined],
      email: 'a@b.com',
    })
    expect(result).toEqual({ held: true, customerId: 'cus_email' })
  })

  it('counts paused and past-due memberships as held', async () => {
    m.subsList.mockResolvedValue({ data: [sub('paused')] })
    expect((await findExistingMembership({ customerIds: ['cus_a'] })).held).toBe(true)
    m.subsList.mockResolvedValue({ data: [sub('past_due')] })
    expect((await findExistingMembership({ customerIds: ['cus_a'] })).held).toBe(true)
  })

  it('ignores non-membership subscriptions and offers the customer for reuse', async () => {
    m.subsList.mockResolvedValue({ data: [sub('active', 'prod_office')] })
    const result = await findExistingMembership({ customerIds: ['cus_a'] })
    expect(result).toEqual({ held: false, customerId: 'cus_a' })
  })

  it('does not reuse a deleted customer', async () => {
    m.customersRetrieve.mockResolvedValue({ id: 'cus_a', deleted: true })
    const result = await findExistingMembership({ customerIds: ['cus_a'] })
    expect(result).toEqual({ held: false, customerId: null })
  })

  it('skips junk customer ids and fails open when Stripe is down', async () => {
    expect(await findExistingMembership({ customerIds: ['n/a'] })).toEqual({
      held: false,
      customerId: null,
    })
    expect(m.subsList).not.toHaveBeenCalled()

    m.customersList.mockRejectedValue(new Error('down'))
    expect(await findExistingMembership({ email: 'a@b.com' })).toEqual({
      held: false,
      customerId: null,
    })
  })
})
