import { describe, expect, it } from 'vitest'
import {
  decideCancellation,
  decideMembershipSync,
  isHeldMembership,
  tierNameForProduct,
} from './stripe-membership-sync'

const CORE = 'prod_RpkYg9EMJoi5oi'
const RESIDENT = 'prod_RpkufjD9E3esG5'
const FRIEND = 'prod_Rq9VzfM9QoJwPD'

const sub = (over = {}) => ({ status: 'active', paused: false, productId: CORE, ...over })

describe('tierNameForProduct', () => {
  it('maps membership products and nothing else', () => {
    expect(tierNameForProduct(CORE)).toBe('Core')
    expect(tierNameForProduct(RESIDENT)).toBe('Resident')
    expect(tierNameForProduct(FRIEND)).toBe('Friend')
    expect(tierNameForProduct('prod_T5NXc8MwPn1ZIl')).toBeNull() // day pass
    expect(tierNameForProduct(null)).toBeNull()
  })
})

describe('decideMembershipSync', () => {
  it('does nothing when Airtable already agrees', () => {
    expect(decideMembershipSync({ tier: 'Core', status: 'Joined' }, sub())).toEqual({
      fields: {}, changes: [],
    })
  })

  it('a paused Friend who resumes onto Core becomes a Joined Core', () => {
    const d = decideMembershipSync({ tier: 'Friend', status: 'Paused' }, sub())
    expect(d.fields).toEqual({ Tier: 'Core', Status: 'Joined' })
    expect(d.changes).toEqual(['Tier Friend → Core', 'Status Paused → Joined'])
  })

  it('pausing marks a Joined member Paused', () => {
    const d = decideMembershipSync({ tier: 'Core', status: 'Joined' }, sub({ paused: true }))
    expect(d.fields).toEqual({ Status: 'Paused' })
  })

  it('follows a switch between Core and Resident', () => {
    const d = decideMembershipSync({ tier: 'Core', status: 'Joined' }, sub({ productId: RESIDENT }))
    expect(d.fields).toEqual({ Tier: 'Resident' })
  })

  it('fills in a blank Tier', () => {
    expect(decideMembershipSync({ tier: null, status: 'Joined' }, sub()).fields).toEqual({ Tier: 'Core' })
  })

  it('leaves tiers that are not set from Stripe', () => {
    for (const tier of ['Staff', 'Courtesy', 'Private Office', 'Program', 'Volunteer']) {
      expect(decideMembershipSync({ tier, status: 'Joined' }, sub()).fields).toEqual({})
    }
  })

  it('never moves a Status that is not a current member', () => {
    for (const status of ['Cancelled', 'Invited', 'Guest Program', 'Applied', null]) {
      expect(decideMembershipSync({ tier: 'Core', status }, sub({ status: 'unpaid' })).fields).toEqual({})
      expect(decideMembershipSync({ tier: 'Core', status }, sub()).fields).toEqual({})
      expect(decideMembershipSync({ tier: 'Core', status }, sub({ paused: true })).fields).toEqual({})
    }
  })

  it('marks Payment Issue only once Stripe gives up (unpaid), not while it retries (past_due)', () => {
    expect(decideMembershipSync({ tier: 'Core', status: 'Joined' }, sub({ status: 'past_due' })).fields).toEqual({})
    expect(decideMembershipSync({ tier: 'Core', status: 'Joined' }, sub({ status: 'unpaid' })).fields).toEqual({
      Status: 'Payment Issue',
    })
    expect(decideMembershipSync({ tier: 'Core', status: 'Paused' }, sub({ status: 'unpaid', paused: true })).fields).toEqual({
      Status: 'Payment Issue',
    })
  })

  it('returns a Payment Issue member to Joined once the subscription is paid', () => {
    const d = decideMembershipSync({ tier: 'Core', status: 'Payment Issue' }, sub())
    expect(d.fields).toEqual({ Status: 'Joined' })
    expect(d.changes).toEqual(['Status Payment Issue → Joined'])
    expect(decideMembershipSync({ tier: 'Core', status: 'Payment Issue' }, sub({ status: 'past_due' })).fields).toEqual({})
  })

  it('does not mark a past_due member Joined on resume, but still pauses them', () => {
    expect(decideMembershipSync({ tier: 'Core', status: 'Paused' }, sub({ status: 'past_due' })).fields).toEqual({})
    expect(
      decideMembershipSync({ tier: 'Core', status: 'Joined' }, sub({ status: 'past_due', paused: true })).fields
    ).toEqual({ Status: 'Paused' })
  })

  it('skips subscriptions that are not live, and non-membership products', () => {
    expect(decideMembershipSync({ tier: 'Friend', status: 'Paused' }, sub({ status: 'canceled' }))).toMatchObject({
      fields: {}, skipped: 'subscription is canceled',
    })
    expect(decideMembershipSync({ tier: 'Core', status: 'Joined' }, sub({ productId: 'prod_other' }))).toMatchObject({
      fields: {}, skipped: 'not a membership product',
    })
  })
})

describe('decideCancellation', () => {
  it('cancels a current member and keeps their Tier', () => {
    for (const status of ['Joined', 'Paused', 'Payment Issue']) {
      expect(decideCancellation({ tier: 'Core', status }, false)).toEqual({
        fields: { Status: 'Cancelled' }, changes: [`Status ${status} → Cancelled`],
      })
    }
  })
  it('does nothing when they still hold another membership subscription', () => {
    expect(decideCancellation({ tier: 'Core', status: 'Joined' }, true).fields).toEqual({})
  })
  it('does not touch people who are not current members', () => {
    for (const status of ['Cancelled', 'Invited', 'Guest Program', 'Event Host', null]) {
      expect(decideCancellation({ tier: 'Core', status }, false).fields).toEqual({})
    }
  })
})

describe('isHeldMembership', () => {
  it('counts live membership subscriptions only', () => {
    expect(isHeldMembership({ status: 'active', productId: CORE })).toBe(true)
    expect(isHeldMembership({ status: 'past_due', productId: RESIDENT })).toBe(true)
    expect(isHeldMembership({ status: 'canceled', productId: CORE })).toBe(false)
    expect(isHeldMembership({ status: 'incomplete', productId: CORE })).toBe(false)
    expect(isHeldMembership({ status: 'active', productId: 'prod_other' })).toBe(false)
  })
})
