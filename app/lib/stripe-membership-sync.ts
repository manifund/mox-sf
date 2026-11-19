// Decides what a Stripe subscription change should write to a member's
// Airtable People record. Pure, so the rules are unit tested without Stripe or
// Airtable; the Stripe webhook does the I/O around it.
//
// Two fields follow Stripe:
//   Tier   — the membership product the subscription is on (Core / Resident)
//   Status — Joined (active), Paused, Payment Issue or Cancelled
//
// Only people who are already members move: Status is changed solely between
// those four values. Getting to Joined in the first place (signup, rejoining
// after a cancellation) is onboarding, which this does not do. Anything else
// about a person (staff, courtesy, invited, guest program…) is left alone.

import { CORE_PROMO_TRIAL_END, tierFromStripeProductId } from './membership-pricing'
import { FRIEND_PRODUCT_ID } from './membership-price-migration'

/** Tiers that come from a Stripe membership product. A person on any other
 *  tier (Staff, Courtesy, Private Office, Program…) keeps it even if they also
 *  hold a subscription. */
const STRIPE_MANAGED_TIERS = ['Friend', 'Core', 'Resident']

/** Subscription statuses that say something about a current member.
 *  `past_due` is Stripe still retrying a failed charge; `unpaid` is Stripe
 *  having given up. */
const SYNCED_STATUSES = ['active', 'trialing', 'past_due', 'unpaid']

/** Statuses that count as holding a membership when deciding whether the end
 *  of one subscription really ends the membership. */
const HELD_STATUSES = [...SYNCED_STATUSES, 'paused']

/** Airtable statuses a cancellation may overwrite. */
const MEMBER_STATUSES = ['Joined', 'Paused', 'Payment Issue']

export interface SubscriptionSnapshot {
  /** Stripe subscription.status */
  status: string
  /** true when pause_collection is set, whatever its behavior */
  paused: boolean
  /** Product of the subscription's first item */
  productId: string | null
}

export interface PersonSnapshot {
  tier: string | null
  status: string | null
}

export interface MembershipSyncDecision {
  /** Fields to write to the People record; empty when nothing should change. */
  fields: { Tier?: string; Status?: string }
  /** Human-readable "Tier Friend → Core" style lines, one per field written. */
  changes: string[]
  /** Why nothing was considered at all, when that is the case. */
  skipped?: string
}

/** Airtable Tier name for a Stripe product, or null if it isn't a membership. */
export function tierNameForProduct(productId: string | null): string | null {
  if (productId === FRIEND_PRODUCT_ID) return 'Friend'
  return tierFromStripeProductId(productId)?.name ?? null
}

export function decideMembershipSync(
  person: PersonSnapshot,
  subscription: SubscriptionSnapshot
): MembershipSyncDecision {
  const productTier = tierNameForProduct(subscription.productId)
  if (!productTier) {
    return { fields: {}, changes: [], skipped: 'not a membership product' }
  }
  if (!SYNCED_STATUSES.includes(subscription.status)) {
    return {
      fields: {},
      changes: [],
      skipped: `subscription is ${subscription.status}`,
    }
  }

  const fields: MembershipSyncDecision['fields'] = {}
  const changes: string[] = []

  const tierIsOurs = !person.tier || STRIPE_MANAGED_TIERS.includes(person.tier)
  if (tierIsOurs && person.tier !== productTier) {
    fields.Tier = productTier
    changes.push(`Tier ${person.tier || '(blank)'} → ${productTier}`)
  }

  const goodStanding =
    subscription.status === 'active' || subscription.status === 'trialing'
  let nextStatus: string | null = null
  if (subscription.status === 'unpaid') {
    // Stripe has stopped retrying the charge.
    if (person.status === 'Joined' || person.status === 'Paused') {
      nextStatus = 'Payment Issue'
    }
  } else if (subscription.paused) {
    if (person.status === 'Joined') nextStatus = 'Paused'
  } else if (goodStanding) {
    // Resumed, or the overdue invoice was paid. While Stripe is still
    // retrying (past_due) nothing moves in either direction.
    if (person.status === 'Paused' || person.status === 'Payment Issue') {
      nextStatus = 'Joined'
    }
  }
  if (nextStatus) {
    fields.Status = nextStatus
    changes.push(`Status ${person.status} → ${nextStatus}`)
  }

  return { fields, changes }
}

/** True when this subscription means the customer still holds a membership. */
export function isHeldMembership(subscription: {
  status: string
  productId: string | null
}): boolean {
  return (
    HELD_STATUSES.includes(subscription.status) &&
    tierNameForProduct(subscription.productId) !== null
  )
}

/** What the end of a membership subscription writes. Tier is kept as a record
 *  of what they were; only Status moves. */
export function decideCancellation(
  person: PersonSnapshot,
  stillHoldsAnotherMembership: boolean
): MembershipSyncDecision {
  if (stillHoldsAnotherMembership) {
    return { fields: {}, changes: [], skipped: 'another membership subscription is still live' }
  }
  if (!person.status || !MEMBER_STATUSES.includes(person.status)) {
    return { fields: {}, changes: [], skipped: `Status is ${person.status || '(blank)'}` }
  }
  return {
    fields: { Status: 'Cancelled' },
    changes: [`Status ${person.status} → Cancelled`],
  }
}

// ============================================================================
// A finished membership sign-up -> the person's People record
// ============================================================================

/** Marks anyone who signed up for Core under the free-through-2026 offer.
 *  Together with the "Free Thru 2026: lapsed" tag it drives the "Free 2026 group"
 *  formula in Airtable: this tag alone = Newbie, both = Returner. */
export const FREE_CORE_2026_SIGNUP_TAG = 'Free Core 2026: NEWBIES'

export interface SignupPersonSnapshot {
  stripeCustomerId: string | null
  /** "Previous Stripe Customer IDs", one per line */
  previousStripeCustomerIds: string | null
  tags: readonly string[]
}

export interface SignupDecision {
  fields: {
    'Stripe Customer ID'?: string
    'Previous Stripe Customer IDs'?: string
    Tags?: string[]
  }
  /** One plain line per field written, for the log. */
  changes: string[]
}

/**
 * What a completed membership checkout writes to the person who signed up.
 * Status and Tier are not touched here (onboarding sets those).
 *
 * - Stripe Customer ID follows the customer Checkout just used. Every sign-up
 *   through /join creates a new Stripe customer, so a replaced id is kept in
 *   "Previous Stripe Customer IDs" rather than lost: Stripe cannot merge
 *   customers, and an old one may still hold a paused subscription.
 * - A Core sign-up during the free-through-2026 promo is tagged.
 * - The door is not touched here. A returning lapsed member is moved to the
 *   MoxSF Verkada group by the Airtable automation "Move returner to MoxSF
 *   door group". "In Verkada" is never unticked: that would re-send them the
 *   Verkada mobile-pass invite.
 */
export function decideSignup(
  person: SignupPersonSnapshot,
  signup: { customerId: string; productId: string | null },
  nowMs: number = Date.now()
): SignupDecision {
  const fields: SignupDecision['fields'] = {}
  const changes: string[] = []
  const tier = tierNameForProduct(signup.productId)
  if (!tier) return { fields, changes }

  if (person.stripeCustomerId !== signup.customerId) {
    fields['Stripe Customer ID'] = signup.customerId
    changes.push(
      `Stripe Customer ID ${person.stripeCustomerId || '(blank)'} → ${signup.customerId}`
    )
    if (person.stripeCustomerId) {
      const previous = (person.previousStripeCustomerIds || '')
        .split(/\s+/)
        .filter(Boolean)
      if (!previous.includes(person.stripeCustomerId)) {
        fields['Previous Stripe Customer IDs'] = [
          ...previous,
          person.stripeCustomerId,
        ].join('\n')
        changes.push(`kept previous customer ${person.stripeCustomerId}`)
      }
    }
  }

  if (
    tier === 'Core' &&
    nowMs < CORE_PROMO_TRIAL_END * 1000 &&
    !person.tags.includes(FREE_CORE_2026_SIGNUP_TAG)
  ) {
    fields.Tags = [...person.tags, FREE_CORE_2026_SIGNUP_TAG]
    changes.push(`tagged ${FREE_CORE_2026_SIGNUP_TAG}`)
  }

  return { fields, changes }
}
