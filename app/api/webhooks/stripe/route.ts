import type Stripe from 'stripe';
import { stripe } from '@/app/lib/stripe';
import { Resend } from 'resend';
import { getDayPassActivationEmail } from '@/app/lib/emails/day-pass-activation';
import {
  Tables,
  createRecord,
  updateRecord,
  findRecord,
  escapeAirtableString,
} from '@/app/lib/airtable';
import { sendChannelMessage, DISCORD_CHANNELS } from '@/app/lib/discord';
import { createMagicLink } from '@/app/lib/magic-link';
import { env } from '@/app/lib/env';
import {
  addMemberToForkable,
  FORKABLE_CLUBS,
  parseFullName,
} from '@/app/lib/forkable';
import {
  MEMBERSHIP_PRODUCTS,
  alertWebhookFailure,
  handleMembershipCheckout,
  handlePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from '@/app/lib/stripe-membership';

const resend = new Resend(env.RESEND_API_KEY);

// Events whose handlers write to Airtable or send mail. A failure returns 500
// so Stripe retries (handlers are idempotent) and staff get a Discord alert.
const RETRYABLE_EVENTS = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

// Map Stripe product IDs to pass types
const DAY_PASS_PRODUCTS: Record<
  string,
  { type: string; description: string; durationDays: number }
> = {
  prod_T5NXc8MwPn1ZIl: {
    type: 'Day Pass',
    description: 'Full day access (9 AM - 11 PM)',
    durationDays: 1,
  },
  prod_T5NXlD25uP8tnI: {
    type: 'Happy Hour Pass',
    description: 'Evening access (after 4 PM)',
    durationDays: 1,
  },
  prod_SqejoSJqKlR4A5: {
    type: 'Week Pass',
    description: 'Full week of access',
    durationDays: 7,
  },
};

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[Stripe Webhook] No signature provided');
    return Response.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`[Stripe Webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Membership subscriptions (from /join and /portal/renew) and one-off
        // day passes share this event; the mode tells them apart.
        if (session.mode === 'subscription') {
          await handleMembershipCheckout(session);
        } else {
          await handleDayPassPurchase(session);
        }
        break;
      }

      case 'customer.subscription.created':
        await handleNewSubscription(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          event.data.previous_attributes as
            | Partial<Stripe.Subscription>
            | undefined
        );
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
    // Paid day passes and membership lifecycle changes must be retried if
    // fulfillment, delivery, or the Airtable write fails.
    if (RETRYABLE_EVENTS.has(event.type)) {
      if (event.type !== 'checkout.session.completed' ||
          (event.data.object as Stripe.Checkout.Session).mode === 'subscription') {
        await alertWebhookFailure(event.type, event.id, error);
      }
      return Response.json({ error: 'Processing failed' }, { status: 500 });
    }
    return Response.json({ received: true, error: 'Processing failed' });
  }

  return Response.json({ received: true });
}

// ============================================================================
// Day Pass Handlers
// ============================================================================

interface ResolvedPass {
  passLabel: string;
  passDescription: string;
  recipientName: string;
  recipientEmail: string;
  issuedByPersonId: string | null;
}

// A checkout.session.completed event might be either a portal-initiated
// member purchase (recipient differs from purchaser, identity in metadata)
// or a standalone purchase from /day-pass (recipient is the Stripe customer).
// This resolves either to a uniform shape so the downstream logic is shared.
async function resolveDayPass(
  session: Stripe.Checkout.Session
): Promise<ResolvedPass | null> {
  if (session.metadata?.type === 'member_day_pass') {
    const { passTypeLabel, guestName, guestEmail, purchaserUserId } =
      session.metadata;
    if (!passTypeLabel || !guestName || !guestEmail) {
      console.error('[Stripe Webhook] Member day pass missing metadata');
      return null;
    }
    const passConfig = Object.values(DAY_PASS_PRODUCTS).find(
      (p) => p.type === passTypeLabel
    );
    return {
      passLabel: passTypeLabel,
      passDescription: passConfig?.description || '',
      recipientName: guestName,
      recipientEmail: guestEmail,
      issuedByPersonId: purchaserUserId || null,
    };
  }

  // Public day-pass purchase: identify the pass by Stripe product id.
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ['data.price.product'],
  });
  if (!lineItems.data.length) return null;

  const product = lineItems.data[0].price?.product as Stripe.Product | undefined;
  const passInfo = product ? DAY_PASS_PRODUCTS[product.id] : null;
  if (!passInfo) {
    console.log(
      '[Stripe Webhook] Not a day pass product:',
      product?.id,
      product?.name
    );
    return null;
  }

  const recipientEmail = session.customer_details?.email;
  const recipientName = session.customer_details?.name || 'Guest';
  if (!recipientEmail) {
    console.error('[Stripe Webhook] No customer email on public day pass');
    return null;
  }

  return {
    passLabel: passInfo.type,
    passDescription: passInfo.description,
    recipientName,
    recipientEmail,
    issuedByPersonId: null,
  };
}

async function handleDayPassPurchase(session: Stripe.Checkout.Session) {
  const resolved = await resolveDayPass(session);
  if (!resolved) return;

  const sessionId = session.id;

  // Track email delivery separately so retries can finish partial fulfillment.
  // Also recognize manually restored passes keyed by payment intent.
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  const sessionFilter = `{Name}="${escapeAirtableString(sessionId)}"`;
  const filter = paymentIntentId
    ? `OR(${sessionFilter},{Name}="${escapeAirtableString(paymentIntentId)}")`
    : sessionFilter;
  const existing = await findRecord(
    Tables.DayPasses,
    filter
  );
  if (existing && existing.fields.Notes !== 'day-pass-activation:pending') {
    console.log('[Stripe Webhook] Session already processed, skipping');
    return;
  }

  console.log(
    `[Stripe Webhook] Processing ${resolved.passLabel} for ${resolved.recipientEmail}` +
      (resolved.issuedByPersonId ? ` (issued by ${resolved.issuedByPersonId})` : '')
  );

  const result = existing
    ? { recordId: existing.id, personId: await findOrCreatePerson({
        customerName: resolved.recipientName,
        customerEmail: resolved.recipientEmail,
      }) }
    : await createDayPassRecord({
    paymentId: sessionId,
    recipientName: resolved.recipientName,
    recipientEmail: resolved.recipientEmail,
    passType: resolved.passLabel,
    issuedByPersonId: resolved.issuedByPersonId,
  });
  if (!result) {
    throw new Error('Failed to create Airtable day pass record');
  }

  const baseUrl = env.NEXT_PUBLIC_BASE_URL;
  const activationLink = result.personId
    ? await createMagicLink(result.personId, baseUrl)
    : `${baseUrl}/portal/login`;

  await sendActivationEmail({
    customerEmail: resolved.recipientEmail,
    customerName: resolved.recipientName,
    passType: resolved.passLabel,
    passDescription: resolved.passDescription,
    activationLink,
  });

  await updateRecord(Tables.DayPasses, result.recordId, {
    Notes: 'day-pass-activation:sent',
  });

  console.log(
    `[Stripe Webhook] Successfully processed ${resolved.passLabel} for ${resolved.recipientEmail}`
  );
}

// Find or create a person in the People table by email
async function findOrCreatePerson({
  customerName,
  customerEmail,
}: {
  customerName: string;
  customerEmail: string;
}): Promise<string | null> {
  try {
    // Search for existing person by email
    const existingPerson = await findRecord(
      Tables.People,
      `{Email}="${escapeAirtableString(customerEmail)}"`
    );

    if (existingPerson) {
      console.log('[Stripe Webhook] Found existing person:', existingPerson.id);
      return existingPerson.id;
    }

    // Create new person
    const newPerson = await createRecord(Tables.People, {
      Name: customerName,
      Email: customerEmail,
    });

    console.log('[Stripe Webhook] Created new person:', newPerson.id);
    return newPerson.id;
  } catch (error) {
    console.error('[Stripe Webhook] Error in findOrCreatePerson:', error);
    throw error;
  }
}

async function createDayPassRecord({
  paymentId,
  recipientName,
  recipientEmail,
  passType,
  issuedByPersonId,
}: {
  paymentId: string;
  recipientName: string;
  recipientEmail: string;
  passType: string;
  issuedByPersonId: string | null;
}): Promise<{ recordId: string; personId: string | null } | null> {
  try {
    const personId = await findOrCreatePerson({
      customerName: recipientName,
      customerEmail: recipientEmail,
    });

    const fields: Record<string, unknown> = {
      Name: paymentId,
      'Pass Type': passType,
      Status: 'Unused',
      Notes: 'day-pass-activation:pending',
    };

    if (personId) fields['User'] = [personId];
    if (issuedByPersonId) fields['Issued By'] = [issuedByPersonId];

    const record = await createRecord(Tables.DayPasses, fields);
    console.log('[Stripe Webhook] Created Airtable record:', record.id);
    return { recordId: record.id, personId };
  } catch (error) {
    console.error('[Stripe Webhook] Error creating day pass record:', error);
    throw error;
  }
}

async function sendActivationEmail({
  customerEmail,
  customerName,
  passType,
  passDescription,
  activationLink,
}: {
  customerEmail: string;
  customerName: string;
  passType: string;
  passDescription: string;
  activationLink: string;
}) {
  const { subject, text } = getDayPassActivationEmail({
    customerName,
    passType,
    passDescription,
    activationLink,
  });

  try {
    const result = await resend.emails.send({
      from: 'Mox SF <noreply@account.moxsf.com>',
      to: customerEmail,
      subject,
      text,
    });

    if (result.error) {
      throw new Error(`Activation email rejected: ${result.error.message}`);
    }
    console.log('[Stripe Webhook] Sent activation email:', result.data?.id);
    return result;
  } catch (error) {
    console.error('[Stripe Webhook] Error sending email:', error);
    throw error;
  }
}

// ============================================================================
// Subscription / Forkable Handlers
// ============================================================================

async function handleNewSubscription(subscription: Stripe.Subscription) {
  // Get the product ID from the subscription
  const item = subscription.items.data[0];
  if (!item) {
    console.log('[Stripe Webhook] No subscription items found');
    return;
  }

  const priceId = typeof item.price === 'string' ? item.price : item.price.id;
  const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  const product = price.product as Stripe.Product;

  const membershipConfig = MEMBERSHIP_PRODUCTS[product.id];
  if (!membershipConfig) {
    console.log(
      '[Stripe Webhook] Not a membership product:',
      product.id,
      product.name
    );
    return;
  }

  // Get customer details
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const customerResponse = await stripe.customers.retrieve(customerId);

  if (customerResponse.deleted) {
    console.error('[Stripe Webhook] Customer has been deleted');
    return;
  }

  const customer = customerResponse as Stripe.Customer;
  const customerEmail = customer.email;
  const customerName = customer.name || '';

  if (!customerEmail) {
    console.error('[Stripe Webhook] No customer email found');
    return;
  }

  console.log(
    `[Stripe Webhook] Processing new ${membershipConfig.tier} subscription for ${customerEmail}`
  );

  // Skip Forkable if no club IDs configured for this tier
  if (membershipConfig.forkableClubIds.length === 0) {
    console.log(
      `[Stripe Webhook] No Forkable clubs configured for ${membershipConfig.tier}, skipping`
    );
    return;
  }

  // Parse name into first/last
  const { firstName, lastName } = parseFullName(customerName);

  // Add member to Forkable
  const result = await addMemberToForkable({
    email: customerEmail,
    firstName: firstName || customerEmail.split('@')[0], // Fallback to email prefix
    lastName,
    clubIds: membershipConfig.forkableClubIds as typeof FORKABLE_CLUBS[keyof typeof FORKABLE_CLUBS][],
  });

  if (!result.success) {
    console.error(
      `[Stripe Webhook] Failed to add ${customerEmail} to Forkable:`,
      result.errors
    );
    // Send failure notification
    await sendForkableNotification({
      customerEmail,
      customerName,
      tier: membershipConfig.tier,
      success: false,
      errors: result.errors,
    });
  } else {
    console.log(
      `[Stripe Webhook] Successfully added ${customerEmail} to Forkable`
    );
    // Send success notification
    await sendForkableNotification({
      customerEmail,
      customerName,
      tier: membershipConfig.tier,
      success: true,
    });
  }
}

async function sendForkableNotification({
  customerEmail,
  customerName,
  tier,
  success,
  errors,
}: {
  customerEmail: string;
  customerName: string;
  tier: string;
  success: boolean;
  errors?: string[];
}) {
  const channelId = DISCORD_CHANNELS.NOTIFICATIONS;
  if (!channelId) {
    console.log('[Stripe Webhook] No Discord notifications channel configured, skipping notification');
    return;
  }

  const name = customerName || customerEmail;
  const message = success
    ? `✅ **Forkable:** ${name} (${customerEmail}) added to Mox ${tier}s`
    : `❌ **Forkable:** Failed to add ${name} (${customerEmail}) to Mox ${tier}s. ` +
      `Please add them manually at https://forkable.com\n\n` +
      `**Errors:**\n${errors?.join('\n') || 'Unknown error'}`;

  const sent = await sendChannelMessage(channelId, message);
  if (sent) {
    console.log('[Stripe Webhook] Sent Forkable Discord notification');
  } else {
    console.error('[Stripe Webhook] Failed to send Forkable Discord notification');
  }
}
