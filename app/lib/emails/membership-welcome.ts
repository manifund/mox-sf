// Membership Welcome Email
// Sent after someone completes a membership checkout (Stripe). Same copy the
// old Zapier "on new Mox subscription" Zap sent. Members who join through the
// Airtable onboarding form get Airtable's own "Welcome to Mox!" email instead.

export const MEMBERSHIP_WELCOME_REPLY_TO = 'robin@moxsf.com'

export function getMembershipWelcomeEmail({ name }: { name: string }) {
  const greeting = name.trim() ? `Hey ${name.trim()},` : 'Hey there,'
  return {
    subject: 'Thanks for joining Mox!',
    text: `${greeting}

Thanks for joining Mox, excited to have you!

You can find your personal door code here, in the members portal: https://moxsf.com/portal

And check out more onboarding info here: https://moxsf.notion.site/new-member-onboarding

And be sure to join the discord, for comms with the Mox team and other members: https://moxsf.com/discord

If you run into any problems, please reach out to robin@moxsf.com!

Best,

The Mox Team
`,
  }
}
