'use client'

import MembershipPricingTable from '@/app/components/MembershipPricingTable'
import { MembershipFaq, MembershipFooter } from '@/app/components/MembershipFaq'

// Laid out like /join (same FAQ, pricing table and footer) so the two pages
// look alike; only the header is specific to a signed-in member.
export default function RenewContent({
  firstName,
  email,
  status,
}: {
  firstName: string
  email: string
  status: string | null
}) {
  const isCancelled = status === 'Cancelled'
  const hey = firstName ? `Hey ${firstName}!` : 'Hey!'

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="mb-16">
          <a
            href="/portal"
            className="text-amber-800 hover:text-amber-600 text-sm mb-6 inline-block"
          >
            &larr; Back to portal
          </a>
          <h1 className="text-4xl font-bold mb-6 font-display text-amber-900">
            {isCancelled ? 'Welcome back!' : 'Start your membership'}
          </h1>
          <p className="text-lg text-gray-700">
            {isCancelled
              ? `${hey} We'd love to have you back at Mox. Pick a membership below to rejoin.`
              : `${hey} Pick a membership below to get started.`}
          </p>
        </div>

        <MembershipFaq />
      </div>

      <div className="pt-4">
        <MembershipPricingTable mode="checkout" customerEmail={email} />
      </div>

      <MembershipFooter />
    </div>
  )
}
