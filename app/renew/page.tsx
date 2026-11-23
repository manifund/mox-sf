import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'
import { getRecord, Tables } from '@/app/lib/airtable'
import { stripe } from '@/app/lib/stripe'
import RenewContent from './RenewContent'

interface MemberFields {
  Name?: string
  Email?: string
  'Stripe Customer ID'?: string
  Status?: string
}

export default async function RenewPage() {
  const session = await getSession()

  if (!session.isLoggedIn) {
    redirect('/portal/login')
  }

  // Use viewingAsUserId if staff is viewing as another user, otherwise use their own userId
  const effectiveUserId = session.viewingAsUserId || session.userId

  // Get user profile from Airtable
  const record = await getRecord<MemberFields>(Tables.People, effectiveUserId)
  if (!record) {
    redirect('/portal')
  }
  const fields = record.fields

  const firstName = fields.Name?.split(' ')[0] || ''
  const email = fields.Email || ''
  const stripeCustomerId = fields['Stripe Customer ID'] || null
  const status = fields.Status || null

  // Get email from Stripe if user has a customer ID
  let customerEmail = email
  if (stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      if (typeof customer !== 'string' && !customer.deleted && customer.email) {
        customerEmail = customer.email
      }
    } catch {
      // Fall back to Airtable email
    }
  }

  return (
    <RenewContent firstName={firstName} email={customerEmail} status={status} />
  )
}
