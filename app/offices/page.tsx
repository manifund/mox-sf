import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Office Space | Mox',
}

function Link({
  href,
  children,
  className = '',
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline decoration-dotted underline-offset-2 ${className}`}
    >
      {children}
    </a>
  )
}

export default function OfficesPage() {
  return (
    <div className="min-h-screen bg-background-page dark:bg-background-page-dark text-text-primary dark:text-text-primary-dark">
      {/* Hero Section */}
      <div className="relative min-h-[60vh] flex items-center justify-center px-4 sm:px-6 py-16 sm:py-24">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-5 dark:invert"
          style={{ backgroundImage: 'url(/images/mox_sketch.png)' }}
        />
        <div className="relative z-10 max-w-4xl w-full text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-gray-200 font-display mb-6">
            Office Space at Mox
          </h1>
          <p className="text-xl sm:text-2xl text-text-secondary dark:text-text-secondary-dark leading-relaxed mb-4">
            Build your team in San Francisco's densest concentration of AI
            researchers and mission-driven builders.
          </p>
          <p className="text-lg text-text-tertiary dark:text-text-tertiary-dark leading-relaxed max-w-3xl mx-auto">
            Mox offers private offices and dedicated desk space for teams
            working on AI safety, frontier technology, and important problems.
            You'll work alongside 150 members including researchers from
            Anthropic, OpenAI, and METR, plus founders, policymakers, and
            independent researchers.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        {/* Private Offices */}
        <section className="mb-16">
          <div className="bg-white dark:bg-gray-700 bg-opacity-95 dark:bg-opacity-95 shadow-xl sm:rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-600">
            <img
              src="/images/005.jpg"
              alt="Private office at Mox"
              className="w-full h-64 object-cover"
            />
            <div className="p-6 sm:p-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-200 font-display mb-3">
                Private Offices
              </h2>
              <p className="text-lg text-text-secondary dark:text-text-secondary-dark mb-2 font-semibold">
                For teams of 2-6 who need dedicated, secure workspace.
              </p>
              <p className="text-base text-text-tertiary dark:text-text-tertiary-dark mb-6 leading-relaxed">
                Private offices give your team a focused environment while
                keeping you connected to Mox's broader community.
              </p>

              <h3 className="text-xl font-semibold text-text-primary dark:text-text-primary-dark mb-3">
                What's included:
              </h3>
              <ul className="space-y-2 mb-6 text-text-secondary dark:text-text-secondary-dark">
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>Lockable private office space</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>Desks and monitors for your team</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>24/7 building access</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>Shared meeting rooms and call booths</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>
                    Kitchen access with subsidized meals through Forkable
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>
                    Full member benefits (gym access, community events,
                    coworking areas)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>High-speed internet and utilities</span>
                </li>
              </ul>

              <div className="bg-background-surface dark:bg-background-subtle-dark p-4 mb-4">
                <p className="text-sm font-semibold text-text-tertiary dark:text-text-tertiary-dark mb-1">
                  Pricing
                </p>
                <p className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
                  Starting at $3,200/month for 4-person capacity
                </p>
                <p className="text-sm text-text-tertiary dark:text-text-tertiary-dark">
                  Additional team members: $800/month per person
                </p>
              </div>

              <p className="text-sm text-text-tertiary dark:text-text-tertiary-dark italic">
                <strong>Good fit for:</strong> Early-stage startups, research
                teams, organizations needing IP security or private workspace.
              </p>
            </div>
          </div>
        </section>

        {/* Dedicated Desks */}
        <section className="mb-16">
          <div className="bg-white dark:bg-gray-700 bg-opacity-95 dark:bg-opacity-95 shadow-xl sm:rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-600">
            <img
              src="/images/003.jpg"
              alt="Dedicated desks at Mox"
              className="w-full h-64 object-cover"
            />
            <div className="p-6 sm:p-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-200 font-display mb-3">
                Dedicated Desks
              </h2>
              <p className="text-lg text-text-secondary dark:text-text-secondary-dark mb-2 font-semibold">
                For individuals or small teams who want a home base at Mox.
              </p>
              <p className="text-base text-text-tertiary dark:text-text-tertiary-dark mb-6 leading-relaxed">
                Dedicated desks give you your own workspace with a monitor,
                while staying embedded in Mox's collaborative environment.
              </p>

              <h3 className="text-xl font-semibold text-text-primary dark:text-text-primary-dark mb-3">
                What's included:
              </h3>
              <ul className="space-y-2 mb-6 text-text-secondary dark:text-text-secondary-dark">
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>Your own desk with monitor</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>24/7 access to your desk and coworking areas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>Shared meeting rooms and call booths</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>
                    Kitchen access with subsidized meals through Forkable
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>
                    Full member benefits (gym access, community events)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-600 dark:text-gray-400 mt-1">
                    •
                  </span>
                  <span>High-speed internet</span>
                </li>
              </ul>

              <div className="bg-background-surface dark:bg-background-subtle-dark p-4 mb-4">
                <p className="text-sm font-semibold text-text-tertiary dark:text-text-tertiary-dark mb-1">
                  Pricing
                </p>
                <p className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
                  $800/month per desk
                </p>
              </div>

              <p className="text-sm text-text-tertiary dark:text-text-tertiary-dark italic">
                <strong>Good fit for:</strong> Consultants, researchers, small
                teams, remote workers establishing SF presence.
              </p>
            </div>
          </div>
        </section>

        {/* For Cohorts & Programs */}
        <section className="mb-16">
          <div className="bg-white dark:bg-gray-700 bg-opacity-95 dark:bg-opacity-95 shadow-xl sm:rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-600">
            <img
              src="/images/021.jpg"
              alt="Cohorts and programs at Mox"
              className="w-full h-64 object-cover"
            />
            <div className="p-6 sm:p-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-200 font-display mb-3">
                For Cohorts & Programs
              </h2>
              <p className="text-lg text-text-secondary dark:text-text-secondary-dark mb-2 font-semibold">
                We host incubation programs, fellowships, and short-term
                cohorts.
              </p>
              <p className="text-base text-text-tertiary dark:text-text-tertiary-dark mb-6 leading-relaxed">
                Mox has experience hosting programs from organizations like
                PIBBSS, Seldon, and Catalyze Impact. We can provide dedicated
                desk space, meeting rooms, and catering for cohorts of 10-25
                participants.
              </p>

              <h3 className="text-xl font-semibold text-text-primary dark:text-text-primary-dark mb-3">
                What's included:
              </h3>
              <ul className="space-y-2 mb-6 text-text-secondary dark:text-text-secondary-dark">
                <li className="flex items-start gap-2">
                  <span className="text-amber-900 dark:text-amber-700 mt-1">
                    •
                  </span>
                  <span>
                    Dedicated desk space with monitors for your cohort
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-900 dark:text-amber-700 mt-1">
                    •
                  </span>
                  <span>
                    Private office(s) for program staff or advisor sessions
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-900 dark:text-amber-700 mt-1">
                    •
                  </span>
                  <span>
                    Shared meeting rooms for workshops and group sessions
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-900 dark:text-amber-700 mt-1">
                    •
                  </span>
                  <span>
                    Lunch and dinner catering through Forkable (~$15-20 per
                    meal)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-900 dark:text-amber-700 mt-1">
                    •
                  </span>
                  <span>Integration with Mox's broader community</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-900 dark:text-amber-700 mt-1">
                    •
                  </span>
                  <span>Flexible arrangements for program duration</span>
                </li>
              </ul>

              <div className="bg-white dark:bg-gray-700 p-4">
                <p className="text-sm font-semibold text-text-tertiary dark:text-text-tertiary-dark mb-1">
                  Pricing
                </p>
                <p className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
                  Custom packages based on cohort size and duration
                </p>
                <p className="text-sm text-text-tertiary dark:text-text-tertiary-dark">
                  Contact us to discuss your needs
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What Makes Mox Different */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-200 font-display mb-6 text-center">
            What Makes Mox Different
          </h2>
          <div className="space-y-6">
            <div className="bg-background-surface dark:bg-background-surface-dark p-6 shadow-md">
              <h3 className="text-xl font-semibold text-text-primary dark:text-text-primary-dark mb-2">
                Community over amenities
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark leading-relaxed">
                We're not trying to be WeWork. Mox is mission-driven, with
                subsidized pricing that prioritizes bringing together people
                working on important problems.
              </p>
            </div>
            <div className="bg-background-surface dark:bg-background-surface-dark p-6 shadow-md">
              <h3 className="text-xl font-semibold text-text-primary dark:text-text-primary-dark mb-2">
                Network effects
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark leading-relaxed">
                Being at Mox means working alongside AI safety researchers,
                policy experts, and ambitious founders. Regular programming,
                speaker events, and organic conversations create opportunities
                you won't find at traditional coworking spaces.
              </p>
            </div>
            <div className="bg-background-surface dark:bg-background-surface-dark p-6 shadow-md">
              <h3 className="text-xl font-semibold text-text-primary dark:text-text-primary-dark mb-2">
                Mission alignment
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark leading-relaxed">
                We focus on AI safety, frontier technology, climate resilience,
                and governance. If you're working on something that matters,
                you'll find your people here.
              </p>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-200 font-display mb-6 text-center">
            FAQs
          </h2>
          <div className="space-y-4">
            <div className="bg-background-surface dark:bg-background-surface-dark p-6 shadow-md">
              <h3 className="text-lg font-semibold text-text-primary dark:text-text-primary-dark mb-2">
                Can I customize my office setup?
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark leading-relaxed">
                Yes, within reason. We accommodate teams working with hardware,
                prototyping equipment, or specialized needs. Hazardous materials
                require prior approval and proper storage protocols.
              </p>
            </div>
            <div className="bg-background-surface dark:bg-background-surface-dark p-6 shadow-md">
              <h3 className="text-lg font-semibold text-text-primary dark:text-text-primary-dark mb-2">
                What's the commitment period?
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark leading-relaxed">
                Standard agreements are month-to-month with 30 days notice. For
                teams interested in longer-term stability, we can discuss
                multi-month or annual commitments with locked pricing.
              </p>
            </div>
            <div className="bg-background-surface dark:bg-background-surface-dark p-6 shadow-md">
              <h3 className="text-lg font-semibold text-text-primary dark:text-text-primary-dark mb-2">
                Do you offer tours?
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark leading-relaxed">
                Yes! Schedule a tour or come to one of our open events to see
                the space and meet the community.
              </p>
            </div>
            <div className="bg-background-surface dark:bg-background-surface-dark p-6 shadow-md">
              <h3 className="text-lg font-semibold text-text-primary dark:text-text-primary-dark mb-2">
                Who should I talk to?
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark leading-relaxed">
                Reach out to Robin Goins at{' '}
                <Link href="mailto:robin@moxsf.com">robin@moxsf.com</Link> to ask
                a question or set up a tour.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="text-center">
          <h2 className="text-3xl font-bold text-amber-900 dark:text-amber-400 font-display mb-6">
            Ready to Join?
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:robin@moxsf.com?subject=Office Space Inquiry"
              className="px-8 py-4 bg-amber-900 dark:bg-amber-900 text-white font-semibold hover:bg-amber-800 dark:hover:bg-amber-800 transition-colors text-center"
            >
              Inquire about office space
            </a>
            <a
              href="mailto:robin@moxsf.com?subject=Office Tour Request"
              className="px-8 py-4 bg-background-surface dark:bg-background-subtle-dark border border-amber-900 dark:border-amber-800 text-gray-700 dark:text-gray-300 font-semibold hover:bg-background-accent dark:hover:bg-background-subtle-dark transition-colors text-center"
            >
              Schedule a tour
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
