'use client'

import { useEffect, useState } from 'react'
import MembershipPricingTable from '@/app/components/MembershipPricingTable'
import { MembershipFaq, MembershipFooter } from '@/app/components/MembershipFaq'
import { STRIPE_BILLING_LOGIN_URL } from '@/app/lib/membership-pricing'
import { lookupJoinLink } from './get-invite-list'

function JoinContent(props: {
  /** Buttons start Stripe checkout; otherwise they go to the application. */
  checkout?: boolean
  firstName?: string
  specialInvite?: string | null
  airtableRecordId?: string | null
}) {
  const { firstName, specialInvite } = props
  return (
    <div className="min-h-screen bg-slate-50 text-gray-800">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Main intro */}
        {props.checkout ? (
          <div className="mb-16">
            <h1 className="text-4xl font-bold mb-6 font-display text-amber-900">
              Join Mox?
            </h1>
            <p className="text-lg text-gray-700">
              Hey{firstName ? ` ${firstName}` : ''}! I'm excited to invite you
              to Mox. Whether you decide to make Mox your main workplace or just
              drop by once in a while — please consider joining as a member!
              <br />
            </p>
          </div>
        ) : (
          <div className="mb-16">
            <h1 className="text-4xl font-bold mb-6 font-display text-amber-900">
              Memberships at Mox
            </h1>
          </div>
        )}

        {/* FAQ Sections (shared with /renew) */}
        <MembershipFaq
          afterFirst={
            specialInvite === 'friend-of-mythos' && (
              <div className="border border-amber-800 p-6 max-w-4xl mx-auto mt-8">
                <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
                  Friend of Mythos
                </h2>
                <p className="text-gray-700 mb-4">
                  Since you're a friend of Vishal's, we'd especially love to
                  have you around -- try out a month of membership, on us!
                </p>
                <a
                  href="https://buy.stripe.com/7sI2bd9TMb582L6fYY"
                  className="inline-block px-6 py-2 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-colors"
                >
                  Try out membership
                </a>
              </div>
            )
          }
        />
      </div>

      {/* Pricing Table */}
      <div className="pt-4">
        <MembershipPricingTable
          mode={props.checkout ? 'checkout' : 'apply'}
          clientReferenceId={props.airtableRecordId}
        />
      </div>

      <MembershipFooter />
    </div>
  )
}

// Whitelist of special invite codes
const SPECIAL_INVITE_CODES = ['friend-of-mythos']

type PageState =
  | { kind: 'loading' }
  | { kind: 'public' }
  | { kind: 'special'; code: string }
  | { kind: 'invited'; firstName: string; recordId: string }
  | { kind: 'member'; firstName: string }
  | { kind: 'not-found' }

// Who's here decides what /join shows:
//   ?id=rec…        their invite (checkout), or the billing portal if they
//                   already pay, or a "link not found" note
//   ?invite=<code>  a special invite (checkout, no Airtable record)
//   nothing         the public page, whose buttons go to the application
export default function JoinPage() {
  const [state, setState] = useState<PageState>({ kind: 'loading' })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const inviteCode = params.get('invite')
    const idParam = params.get('id')

    if (idParam) {
      lookupJoinLink(idParam).then((result) => {
        if (result.kind === 'invited') {
          setState({
            kind: 'invited',
            firstName: result.name.split(' ')[0],
            recordId: result.recordId,
          })
        } else if (result.kind === 'member') {
          setState({ kind: 'member', firstName: result.name.split(' ')[0] })
        } else {
          setState({ kind: 'not-found' })
        }
      })
    } else if (inviteCode && SPECIAL_INVITE_CODES.includes(inviteCode)) {
      setState({ kind: 'special', code: inviteCode })
    } else {
      setState({ kind: 'public' })
    }
  }, [])

  switch (state.kind) {
    case 'loading':
      return <div className="min-h-screen bg-[#f9f6f0]" />
    case 'public':
      return <JoinContent />
    case 'special':
      return <JoinContent checkout specialInvite={state.code} />
    case 'invited':
      return (
        <JoinContent
          checkout
          firstName={state.firstName}
          airtableRecordId={state.recordId}
        />
      )
    case 'member':
      return (
        <Envelope title={`You're already a member, ${state.firstName}!`}>
          <p className="text-gray-700 mb-6">
            To change your tier, switch billing, or update your card, sign in to
            the billing portal with the email you signed up with.
          </p>
          <a
            href={STRIPE_BILLING_LOGIN_URL}
            className="inline-block w-full px-6 py-2 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-colors"
          >
            Manage your membership
          </a>
        </Envelope>
      )
    case 'not-found':
      return (
        <Envelope title="We couldn't find your invite">
          <p className="text-gray-700">
            This join link may be out of date. Email{' '}
            <a
              href="mailto:robin@moxsf.com"
              className="underline text-amber-800"
            >
              robin@moxsf.com
            </a>{' '}
            and we'll send you a fresh one!
          </p>
        </Envelope>
      )
  }
}

function Envelope({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#f9f6f0] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white shadow-xl p-12 relative">
          <div className="absolute -top-4 -left-4 w-8 h-8 border-t-2 border-l-2 border-amber-800"></div>
          <div className="absolute -bottom-4 -right-4 w-8 h-8 border-b-2 border-r-2 border-amber-800"></div>
          <div className="absolute -top-4 -right-4 w-8 h-8 border-t-2 border-r-2 border-amber-800"></div>
          <div className="absolute -bottom-4 -left-4 w-8 h-8 border-b-2 border-l-2 border-amber-800"></div>
          <div className="text-center max-w-sm mx-auto">
            <h1 className="text-3xl font-bold mb-6 font-display text-amber-900">
              {title}
            </h1>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
