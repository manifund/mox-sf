import { getSession } from '@/app/lib/session'
import { getRecord, Tables } from '@/app/lib/airtable'
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord'
import { stripe } from '@/app/lib/stripe'
import { sendEmail } from '@/app/lib/email'
import { promoResumeTrial } from '@/app/lib/membership-pricing'

interface PersonFields {
  Email?: string
  Name?: string
  'Stripe Customer ID'?: string
}

// Format a date for display
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Send Discord notification to staff
async function notifyStaff(
  userEmail: string,
  userName: string,
  resumeDate: string | null,
  reason: string
) {
  const pauseInfo = resumeDate
    ? `Resume on: ${formatDate(resumeDate)}`
    : 'Paused indefinitely'

  await sendChannelMessage(
    DISCORD_CHANNELS.NOTIFICATIONS,
    `⏸️ **Subscription Paused:** ${userName} (${userEmail})\n${pauseInfo}\nReason: ${reason}`
  )
}

// Send Discord notification when subscription is resumed
async function notifyStaffResume(userEmail: string, userName: string) {
  await sendChannelMessage(
    DISCORD_CHANNELS.NOTIFICATIONS,
    `▶️ **Subscription Resumed:** ${userName} (${userEmail})`
  )
}

// Send confirmation email to user about subscription pause
async function notifyUserPause(
  userEmail: string,
  userName: string,
  resumeDate: string | null,
  reason: string
) {
  const pauseInfo = resumeDate
    ? `Your subscription will automatically resume on ${formatDate(resumeDate)}.`
    : 'Your subscription is paused indefinitely. You can resume it anytime from your member portal.'

  await sendEmail({
    to: userEmail,
    subject: 'Your Mox Membership Has Been Paused',
    text: `Hi ${userName},

Your Mox membership has been paused.

${pauseInfo}

Reason: ${reason}

If you have any questions, please contact us at team@moxsf.com.

Best,
The Mox Team`,
  })
}

// Send confirmation email to user about subscription resume
async function notifyUserResume(
  userEmail: string,
  userName: string,
  freeUntilJan1: boolean
) {
  const billingLine = freeUntilJan1
    ? "You won't be charged until January 1, 2027: membership is free through the end of 2026."
    : 'Your next billing cycle will begin according to your subscription schedule.'

  await sendEmail({
    to: userEmail,
    subject: 'Your Mox Membership Has Been Resumed',
    text: `Hi ${userName},

Your Mox membership has been resumed and is now active again.

${billingLine}

If you have any questions, please contact us at team@moxsf.com.

Best,
The Mox Team`,
  })
}

// Send confirmation to admin when they pause a subscription for another user
async function notifyAdminPause(
  adminEmail: string,
  adminName: string,
  userEmail: string,
  userName: string,
  resumeDate: string | null,
  reason: string
) {
  const pauseInfo = resumeDate
    ? `Resume on: ${formatDate(resumeDate)}`
    : 'Paused indefinitely'

  await sendEmail({
    to: adminEmail,
    subject: `Confirmation: You Paused ${userName}'s Membership`,
    text: `Hi ${adminName},

You have paused the membership for ${userName} (${userEmail}).

${pauseInfo}
Reason: ${reason}

This is a confirmation of the action you took in the member portal.

Best,
The Mox Team`,
  })
}

// Send confirmation to admin when they resume a subscription for another user
async function notifyAdminResume(
  adminEmail: string,
  adminName: string,
  userEmail: string,
  userName: string
) {
  await sendEmail({
    to: adminEmail,
    subject: `Confirmation: You Resumed ${userName}'s Membership`,
    text: `Hi ${adminName},

You have resumed the membership for ${userName} (${userEmail}).

Their subscription is now active again.

This is a confirmation of the action you took in the member portal.

Best,
The Mox Team`,
  })
}

// Get user info from Airtable
async function getUserInfo(userId: string) {
  const record = await getRecord<PersonFields>(Tables.People, userId)

  if (!record) {
    return null
  }

  return {
    email: record.fields.Email || '',
    name: record.fields.Name || '',
    customerId: record.fields['Stripe Customer ID'] || '',
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { resumeDate, reason } = await request.json()

    // Validate reason
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return Response.json({ error: 'Reason is required' }, { status: 400 })
    }

    // Validate resumeDate if provided
    if (resumeDate) {
      const resumeDateObj = new Date(resumeDate)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (resumeDateObj < today) {
        return Response.json(
          { error: 'Resume date must be in the future' },
          { status: 400 }
        )
      }
    }

    // Get user information - use viewingAsUserId if staff is viewing as another user
    const effectiveUserId = session.viewingAsUserId || session.userId
    const userInfo = await getUserInfo(effectiveUserId)
    if (!userInfo || !userInfo.customerId) {
      return Response.json(
        { error: 'User or subscription not found' },
        { status: 404 }
      )
    }

    // Get the user's active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: userInfo.customerId,
      status: 'active',
      limit: 1,
    })

    if (subscriptions.data.length === 0) {
      return Response.json(
        { error: 'No active subscription found' },
        { status: 404 }
      )
    }

    const subscription = subscriptions.data[0]

    // Calculate pause end date from resumeDate if provided
    let pauseEndTimestamp: number | undefined = undefined
    let pausedUntilString: string | null = null

    if (resumeDate) {
      const resumeDateObj = new Date(resumeDate)
      pauseEndTimestamp = Math.floor(resumeDateObj.getTime() / 1000)
      pausedUntilString = resumeDateObj.toISOString()
    }

    // Pause the subscription in Stripe
    await stripe.subscriptions.update(subscription.id, {
      pause_collection: {
        behavior: 'void',
        resumes_at: pauseEndTimestamp,
      },
      metadata: {
        pause_reason: reason,
      },
    })

    // Send notifications
    await notifyStaff(userInfo.email, userInfo.name, resumeDate, reason)
    await notifyUserPause(userInfo.email, userInfo.name, resumeDate, reason)

    // If an admin is acting on behalf of another user, notify the admin
    if (session.viewingAsUserId && session.viewingAsUserId === effectiveUserId) {
      await notifyAdminPause(
        session.email,
        session.name || 'Admin',
        userInfo.email,
        userInfo.name,
        resumeDate,
        reason
      )
    }

    return Response.json({
      success: true,
      pausedUntil: pausedUntilString,
      indefinite: !resumeDate,
    })
  } catch (error) {
    console.error('[Pause Subscription] Error pausing subscription:', error)
    return Response.json(
      { error: 'Failed to pause subscription' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user information - use viewingAsUserId if staff is viewing as another user
    const effectiveUserId = session.viewingAsUserId || session.userId
    const userInfo = await getUserInfo(effectiveUserId)
    if (!userInfo || !userInfo.customerId) {
      return Response.json(
        { error: 'User or subscription not found' },
        { status: 404 }
      )
    }

    // Get the user's paused subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: userInfo.customerId,
      limit: 1,
    })

    if (subscriptions.data.length === 0) {
      return Response.json({ error: 'No subscription found' }, { status: 404 })
    }

    const subscription = subscriptions.data[0]

    // Check if subscription is paused
    if (!subscription.pause_collection) {
      return Response.json(
        { error: 'Subscription is not paused' },
        { status: 400 }
      )
    }

    // Resume the subscription. During the free-through-2026 promo a resumed
    // Core or Friend subscription also goes on the free trial to Jan 1, so
    // un-pausing never charges anyone before then.
    const product = subscription.items.data[0]?.price.product
    const promoTrial = promoResumeTrial(
      typeof product === 'string' ? product : product?.id
    )
    await stripe.subscriptions.update(subscription.id, {
      pause_collection: null,
      metadata: {
        pause_reason: '',
      },
      ...promoTrial,
    })

    // Send notifications
    await notifyStaffResume(userInfo.email, userInfo.name)
    await notifyUserResume(
      userInfo.email,
      userInfo.name,
      'trial_end' in promoTrial
    )

    // If an admin is acting on behalf of another user, notify the admin
    if (session.viewingAsUserId && session.viewingAsUserId === effectiveUserId) {
      await notifyAdminResume(
        session.email,
        session.name || 'Admin',
        userInfo.email,
        userInfo.name
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('[Pause Subscription] Error resuming subscription:', error)
    return Response.json(
      { error: 'Failed to resume subscription' },
      { status: 500 }
    )
  }
}
