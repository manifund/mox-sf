// Membership Welcome Email
// Sent once when a Stripe membership subscription checkout completes (Core,
// Resident, Friend). Copy mirrors the retired "On new Mox subscription" Zap
// plus the portal door-code pointer from the Airtable Auto-Onboarding email.

export function getMembershipWelcomeEmail({
  customerName,
  tier,
}: {
  customerName: string
  tier: string
}) {
  const subject = 'Thanks for joining Mox!'
  const firstName = customerName.trim().split(/\s+/)[0]
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,'

  const text = `
${greeting}

Thanks for joining Mox as a ${tier} member, excited to have you!

To find your personal code for the front door, log into the portal with
this email address: https://moxsf.com/portal

Jump in our Discord for comms with staff and other members, and for access
instructions on your first day: https://moxsf.com/discord

More onboarding info: https://moxsf.notion.site/new-member-onboarding

If you'd like to change tiers or cancel, you can do so from the portal.

Questions? Just reply to this email.

See you soon!
- The Mox crew
`.trim()

  return { subject, text }
}
