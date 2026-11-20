'use client'

import { useEffect, useState } from 'react'
import MembershipPricingTable from '@/app/components/MembershipPricingTable'
import {
  STRIPE_BILLING_LOGIN_URL,
  corePromoTrialActive,
} from '@/app/lib/membership-pricing'
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
              Hey{firstName ? ` ${firstName}` : ''}! I'm excited to invite you to Mox. Whether you
              decide to make Mox your main workplace or just drop by once in a
              while — please consider joining as a member!
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

        {/* FAQ Sections */}
        <div className="space-y-12 mb-16">
          <section>
            <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
              Which membership is right for me?
            </h2>
            <p className="text-gray-700">
              We expect <u className="underline-offset-2">Core</u> to be a
              good fit for most. As a member, you can come by anytime: during
              the day for focused work, or evenings and weekends to hang out.
              You'll have full access to our space: hot desks, lounges,
              cafeteria, call booths & meeting rooms. And we'd ask you to make
              Mox yours: host small events, bring guests, and find ways to help
              each other flourish.
              <br /> <br />
              If you're planning on coming in 4+ days a week, and especially if
              you're working with teammates, the{' '}
              <u className="underline-offset-2">Resident</u> option may be a
              better fit. This includes a dedicated desk where you can leave
              belongings, and external monitor.
              <br /> <br />
              {corePromoTrialActive() ? (
                <>
                  Core membership is free through December 31, 2026: join now
                  and billing starts January 1. Resident memberships come with
                  a 1-week free trial. You can also update or cancel your
                  membership at any time.
                </>
              ) : (
                <>
                  We want you to be confident that Mox is the right choice, so
                  every membership comes with a 1-week free trial. You can also
                  update or cancel your membership at any time.
                </>
              )}
            </p>
          </section>

          {specialInvite === 'friend-of-mythos' && (
            <div className="border border-amber-800 p-6 max-w-4xl mx-auto mt-8">
              <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
                Friend of Mythos
              </h2>
              <p className="text-gray-700 mb-4">
                Since you're a friend of Vishal's, we'd especially love to have
                you around -- try out a month of membership, on us!
              </p>
              <a
                href="https://buy.stripe.com/7sI2bd9TMb582L6fYY"
                className="inline-block px-6 py-2 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-colors"
              >
                Try out membership
              </a>
            </div>
          )}

          {/* <section>
            <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
              Mox is in beta — what does that mean?
            </h2>
            <p className="text-gray-700">
              Our space is new, and there's still a lot we're figuring out: what
              kinds of people we host; how we lay out and design the space;
              whether we want to focus on coworking, offices, or events; how our
              financial model will shake out; how we'll orient to the whole AI
              thing...
              <br /> <br />
              The best way to learn is by doing! So our plan is to test out
              different setups and events — things will continue to change a
              lot. Hence, "beta". Hopefully, you're okay with a bit of chaos,
              and are excited to work with us to improve our space.
            </p>
          </section> */}

          {/* <section>
            <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
              Why is membership so cheap?
            </h2>
            <p className="text-gray-700">
              I like to say that "Mox isn't a WeWork". We're not here to provide
              some generic coworking service where we maximize the delta between
              our prices and our costs.
              <br /> <br />
              Rather, our priority is to bring in <i>really great people</i>:
              people who make you eager to drop by on a weekend afternoon, who
              you can't help but talk late into the night with, who help you
              become the best version of yourself. People with whom you'll share
              ideas, start projects, invite to your wedding.
              <br /> <br />
              It's so important that great people are at Mox that we're happy to
              invite people slowly, and run at a loss for a while. (We spent
              roughly ~$100k/mo and earned ~$30k/mo across our first three
              months.) We have a bunch of ideas on how to make Mox fiscally
              sustainable: events; grants; sponsorships; donations; incubate
              projects like YC. But for now, we want to make it as easy as
              possible for you to say "yes".
            </p>
          </section> */}

          <section>
            <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
              What is the guest policy?
            </h2>
            <p className="text-gray-700">
              We want Mox to be a place you're proud to show off to your friends
              and family. Every membership includes free guest passes each
              week: 2 for Core, 4 for Resident, and 6 per person for Office
              members. You create a pass from the member portal and send your
              guest a link that opens the front door for the day. Beyond that,
              we ask that you or your guest purchase a{' '}
              <a
                href="/day-pass"
                className="text-amber-800 hover:text-amber-600 underline decoration-dotted underline-offset-2"
              >
                day pass
              </a>
              .
              <br />
              <br />
              We do ask that you be on site to host your guests, and to have
              your guests sign in at the lobby. This helps us keep track of
              who's coming to Mox!
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
              How do I manage my membership?
            </h2>
            <p className="text-gray-700 mb-4">
              If you'd like to cancel your membership or change tiers, you can
              do so here:
            </p>
            <a
              href={STRIPE_BILLING_LOGIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-2 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-colors"
            >
              Manage your membership
            </a>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
              What about private offices?
            </h2>
            <p className="text-gray-700">
              Reach out to{' '}
              <a href="mailto:robin@moxsf.com">robin@moxsf.com</a>! We have a
              limited number of private offices available, starting at $5k/mo
              for a 4-person office ($4k/mo for mission-aligned teams). And if you're a startup, we may be
              interested in investing a small amount as well, to align our
              incentives!
            </p>
          </section>
        </div>
      </div>

      {/* Pricing Table */}
      <div className="pt-4">
        <MembershipPricingTable
          mode={props.checkout ? 'checkout' : 'apply'}
          clientReferenceId={props.airtableRecordId}
        />
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-gray-500">
          Questions? Ping{' '}
          <a
            href="mailto:robin@moxsf.com"
            className="text-amber-800 hover:text-amber-600 underline decoration-dotted underline-offset-2"
          >
            robin@moxsf.com
          </a>
          ~
        </div>
      </footer>
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
            To change your tier, switch billing, or update your card, sign in
            to the billing portal with the email you signed up with.
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
            <a href="mailto:robin@moxsf.com" className="underline text-amber-800">
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
