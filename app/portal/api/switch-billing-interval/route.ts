import { getSession } from '@/app/lib/session'
import { getRecord, Tables } from '@/app/lib/airtable'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import { stripe } from '@/app/lib/stripe'
import { sendEmail } from '@/app/lib/email'
import {
  type BillingInterval,
  chargeCents,
  isBillingInterval,
} from '@/app/lib/membership-pricing'
import {
  buildSwitchPhases,
  formatRate,
  planSwitchEligibility,
} from '@/app/lib/billing-interval-switch'
import {
  findLiveSubscription,
  pendingSwitchOf,
  scheduleOf,
  summarizeSubscription,
} from '@/app/lib/membership-plan'

// Lets a member move between month-to-month and quarterly billing for their
// current tier. The change is scheduled for the end of the period they've
// already paid for (see app/lib/billing-interval-switch.ts for why a
// Subscription Schedule rather than a direct price update). DELETE cancels a
// switch that hasn't happened yet.

interface PersonFields {
  Email?: string
  Name?: string
  'Stripe Customer ID'?: string
}

async function getUserInfo(userId: string) {
  const record = await getRecord<PersonFields>(Tables.People, userId)
  if (!record) return null
  return {
    email: record.fields.Email || '',
    name: record.fields.Name || '',
    customerId: record.fields['Stripe Customer ID'] || '',
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: 'month-to-month',
  quarterly: 'quarterly',
}

async function loadMember() {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const effectiveUserId = session.viewingAsUserId || session.userId
  const userInfo = await getUserInfo(effectiveUserId)
  if (!userInfo) {
    // A logged-in session always points at a People record, so a miss here
    // is almost always Airtable timing out or rate-limiting (getRecord
    // returns null for any failure), not a missing member.
    console.error(
      `[switch-billing-interval] Could not load People record ${effectiveUserId}`
    )
    return {
      error: Response.json(
        {
          error:
            "Couldn't load your membership record just now. Please try again in a moment.",
        },
        { status: 503 }
      ),
    }
  }
  if (!userInfo.customerId) {
    return {
      error: Response.json(
        { error: 'No subscription found for your account' },
        { status: 404 }
      ),
    }
  }
  const subscription = await findLiveSubscription(userInfo.customerId)
  if (!subscription) {
    return {
      error: Response.json(
        { error: 'No active subscription found' },
        { status: 404 }
      ),
    }
  }
  const actingAdmin =
    session.viewingAsUserId && session.viewingAsUserId === effectiveUserId
      ? { email: session.email, name: session.name || 'Admin' }
      : null
  return { userInfo, subscription, actingAdmin }
}

export async function POST(request: Request) {
  try {
    const member = await loadMember()
    if ('error' in member) return member.error
    const { userInfo, subscription, actingAdmin } = member

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const interval = body.interval
    if (!isBillingInterval(interval)) {
      return Response.json(
        { error: 'interval must be quarterly|monthly' },
        { status: 400 }
      )
    }

    const eligibility = planSwitchEligibility(summarizeSubscription(subscription))
    if (!eligibility.ok) {
      return Response.json(
        {
          error:
            eligibility.message ||
            'This subscription cannot change billing plan from the portal',
        },
        { status: 400 }
      )
    }
    if (eligibility.target !== interval) {
      return Response.json(
        { error: `You are already on ${INTERVAL_LABEL[interval]} billing` },
        { status: 400 }
      )
    }
    const { tier } = eligibility

    if (await pendingSwitchOf(subscription)) {
      return Response.json(
        { error: 'A billing plan change is already scheduled' },
        { status: 409 }
      )
    }

    const lookupKey = tier.stripeLookupKeys[interval]
    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
      limit: 1,
    })
    const targetPrice = prices.data[0]
    if (!targetPrice) {
      console.error(
        `[switch-billing-interval] No active Stripe price with lookup_key ${lookupKey}`
      )
      return Response.json(
        { error: `The ${tier.name} ${interval} plan isn't set up yet` },
        { status: 500 }
      )
    }
    if (!targetPrice.recurring) {
      console.error(
        `[switch-billing-interval] Price ${targetPrice.id} (${lookupKey}) is not recurring`
      )
      return Response.json(
        { error: `The ${tier.name} ${interval} plan isn't set up yet` },
        { status: 500 }
      )
    }
    const expected = chargeCents(tier, interval)
    if (targetPrice.unit_amount !== expected) {
      console.warn(
        `[switch-billing-interval] Price ${targetPrice.id} (${lookupKey}) charges ${targetPrice.unit_amount} but membership-pricing.ts expects ${expected}`
      )
    }

    // A schedule left over from something else (nothing pending) would fight
    // with ours, so release it and start from the subscription as it is now.
    const existingSchedule = await scheduleOf(subscription)
    if (existingSchedule && existingSchedule.status === 'active') {
      await stripe.subscriptionSchedules.release(existingSchedule.id)
    }

    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscription.id,
    })
    const currentPhase = schedule.phases[0]
    try {
      const phases = buildSwitchPhases(
        {
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
          trial_end: currentPhase.trial_end,
          items: currentPhase.items.map((item) => ({
            price: typeof item.price === 'string' ? item.price : item.price.id,
            quantity: item.quantity,
          })),
        },
        { id: targetPrice.id, recurring: targetPrice.recurring }
      )
      await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases,
        metadata: {
          source: 'portal-switch-billing-interval',
          requested_by: actingAdmin ? actingAdmin.email : userInfo.email,
        },
      })
    } catch (error) {
      // Without this the subscription stays attached to a one-phase schedule
      // that changes nothing but blocks every other price edit (dashboard,
      // migration tool) until someone releases it by hand. Put it back the
      // way we found it, then report the original failure.
      console.error(
        `[switch-billing-interval] Could not add the ${interval} phase to ${schedule.id}; releasing it:`,
        error
      )
      await stripe.subscriptionSchedules
        .release(schedule.id)
        .catch((releaseError) =>
          console.error(
            `[switch-billing-interval] Could not release ${schedule.id}:`,
            releaseError
          )
        )
      throw error
    }

    const effectiveDate = new Date(currentPhase.end_date * 1000)
    const rate = formatRate(targetPrice.unit_amount, targetPrice.recurring)
    const label = INTERVAL_LABEL[interval]

    await sendChannelMessage(
      DISCORD_CHANNELS.NOTIFICATIONS,
      `🔁 **Billing plan change:** ${userInfo.name} (${userInfo.email}) → ${tier.name} ${label} (${rate}) from ${formatDate(effectiveDate)}${actingAdmin ? ` (by ${actingAdmin.email})` : ''}`
    )
    await sendEmail({
      to: userInfo.email,
      subject: `Your Mox billing plan is changing to ${label}`,
      text: `Hi ${userInfo.name},

Your ${tier.name} membership will move to ${label} billing on ${formatDate(effectiveDate)}. Nothing changes before then.

From that date you'll be billed ${rate}.${
        interval === 'quarterly'
          ? ' Quarterly billing renews every three months.'
          : ''
      }

You can cancel this change from your member portal any time before it takes effect. If you have any questions, reply to this email or contact us at team@moxsf.com.

Best,
The Mox Team`,
    })
    if (actingAdmin) {
      await sendEmail({
        to: actingAdmin.email,
        subject: `Confirmation: You changed ${userInfo.name}'s billing plan`,
        text: `Hi ${actingAdmin.name},

You scheduled ${userInfo.name} (${userInfo.email}) to move to ${tier.name} ${label} billing (${rate}) on ${formatDate(effectiveDate)}.

This is a confirmation of the action you took in the member portal.

Best,
The Mox Team`,
      })
    }

    return Response.json({
      success: true,
      interval,
      rate,
      effectiveDate: effectiveDate.toISOString(),
    })
  } catch (error) {
    console.error('[switch-billing-interval] Error scheduling switch:', error)
    return Response.json(
      { error: 'Failed to change billing plan' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const member = await loadMember()
    if ('error' in member) return member.error
    const { userInfo, subscription, actingAdmin } = member

    const schedule = await scheduleOf(subscription)
    const pending = await pendingSwitchOf(subscription)
    if (!schedule || !pending) {
      return Response.json(
        { error: 'No billing plan change is scheduled' },
        { status: 400 }
      )
    }

    // Releasing keeps the subscription exactly as it is in the current phase.
    await stripe.subscriptionSchedules.release(schedule.id)

    await sendChannelMessage(
      DISCORD_CHANNELS.NOTIFICATIONS,
      `↩️ **Billing plan change cancelled:** ${userInfo.name} (${userInfo.email})${actingAdmin ? ` (by ${actingAdmin.email})` : ''}`
    )
    await sendEmail({
      to: userInfo.email,
      subject: 'Your Mox billing plan change has been cancelled',
      text: `Hi ${userInfo.name},

The billing plan change you had scheduled has been cancelled. Your membership continues on its current plan.

If you have any questions, contact us at team@moxsf.com.

Best,
The Mox Team`,
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error('[switch-billing-interval] Error cancelling switch:', error)
    return Response.json(
      { error: 'Failed to cancel billing plan change' },
      { status: 500 }
    )
  }
}
