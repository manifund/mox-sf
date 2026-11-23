import type { ReactNode } from 'react'
import {
  STRIPE_BILLING_LOGIN_URL,
  corePromoTrialActive,
} from '@/app/lib/membership-pricing'

// The membership FAQ shared by /join and /renew, so the two pages
// stay alike. `afterFirst` goes right after "Which membership is right for
// me?" (used for special-invite callouts on /join).
export function MembershipFaq({ afterFirst }: { afterFirst?: ReactNode }) {
  return (
    <div className="space-y-12 mb-16">
      <section>
        <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
          Which membership is right for me?
        </h2>
        <p className="text-gray-700">
          We expect <u className="underline-offset-2">Core</u> to be a good fit
          for most. As a member, you can come by anytime: during the day for
          focused work, or evenings and weekends to hang out. You'll have full
          access to our space: hot desks, lounges, cafeteria, call booths &
          meeting rooms. And we'd ask you to make Mox yours: host small events,
          bring guests, and find ways to help each other flourish.
          <br /> <br />
          If you're planning on coming in 4+ days a week, and especially if
          you're working with teammates, the{' '}
          <u className="underline-offset-2">Resident</u> option may be a better
          fit. This includes a dedicated desk where you can leave belongings,
          and external monitor.
          <br /> <br />
          {corePromoTrialActive() ? (
            <>
              Core membership is free through December 31, 2026: join now and
              billing starts January 1. Resident memberships come with a 1-week
              free trial. You can also update or cancel your membership at any
              time.
            </>
          ) : (
            <>
              We want you to be confident that Mox is the right choice, so every
              membership comes with a 1-week free trial. You can also update or
              cancel your membership at any time.
            </>
          )}
        </p>
      </section>

      {afterFirst}

      <section>
        <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
          What is the guest policy?
        </h2>
        <p className="text-gray-700">
          We want Mox to be a place you're proud to show off to your friends and
          family. Every membership includes free guest passes each week: 2 for
          Core, 4 for Resident, and 6 per person for Office members. You create
          a pass from the member portal and send your guest a link that opens
          the front door for the day. Beyond that, we ask that you or your guest
          purchase a{' '}
          <a
            href="/day-pass"
            className="text-amber-800 hover:text-amber-600 underline decoration-dotted underline-offset-2"
          >
            day pass
          </a>
          .
          <br />
          <br />
          We do ask that you be on site to host your guests, and to have your
          guests sign in at the lobby. This helps us keep track of who's coming
          to Mox!
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4 text-amber-900 font-display">
          How do I manage my membership?
        </h2>
        <p className="text-gray-700 mb-4">
          If you'd like to cancel your membership or change tiers, you can do so
          here:
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
          Reach out to <a href="mailto:robin@moxsf.com">robin@moxsf.com</a>! We
          have a limited number of private offices available, starting at $5k/mo
          for a 4-person office ($4k/mo for mission-aligned teams). And if
          you're a startup, we may be interested in investing a small amount as
          well, to align our incentives!
        </p>
      </section>
    </div>
  )
}

export function MembershipFooter() {
  return (
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
  )
}
