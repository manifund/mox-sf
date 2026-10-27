import Gallery from '../venue-gallery'

function Link({
  href,
  children,
  className,
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
      className={`text-amber-800 hover:text-amber-600 underline decoration-dotted underline-offset-2 ${className}`}
    >
      {children}
    </a>
  )
}

function PartnerCard({
  name,
  url,
  logoUrl,
  logoPlaceholder,
  bgColor = 'black',
}: {
  name: string
  url: string
  logoUrl?: string
  logoPlaceholder?: string
  bgColor?: string
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center gap-4 hover:bg-slate-200 p-4"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className={`w-36 h-36 ${bgColor} p-3 object-contain`}
        />
      ) : (
        <div className="w-36 h-36 bg-black border border-gray-200 flex items-center justify-center text-gray-400 text-xs font-mono mr-4 overflow-hidden">
          {logoPlaceholder}
        </div>
      )}
      <h3 className="text-xl font-bold font-merriweather text-gray-900">
        {name}
      </h3>
    </a>
  )
}

function TestimonialCard({ name, quote }: { name: string; quote: string }) {
  return (
    <div className="bg-white p-6 border-l-4 border-gray-400 dark:border-gray-500 shadow-sm break-inside-avoid">
      <p className="text-gray-700 mb-4 leading-relaxed text-sm">{quote}</p>
      <p className="text-gray-600 font-semibold">— {name}</p>
    </div>
  )
}

export default function GuestProgramPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-gray-800">
      {/* Hero section */}
      <div className="max-w-4xl mx-auto pt-20 px-6">
        <div className="text-center mb-20">
          <h1 className="text-5xl font-bold font-display mb-6">
            Mox Guest Program
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Drop-in access to Mox, for people working at orgs we admire.
          </p>
        </div>

        {/* What Mox offers section */}
        <section className="mb-20">
          <div className="bg-white shadow-lg p-8 border border-slate-100 relative">
            <div className="absolute -top-4 -left-4 w-8 h-8 border-t-2 border-l-2 border-gray-400"></div>
            <div className="absolute -bottom-4 -right-4 w-8 h-8 border-b-2 border-r-2 border-gray-400"></div>

            {/* <h2 className="text-3xl font-bold mb-12 text-center font-display">
              What Mox offers guests
            </h2> */}
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-slate-100 flex items-center justify-center mx-auto mb-6">
                  <svg
                    className="w-8 h-8 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">
                  Flexible access
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  2x/month complimentary access to our space
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-slate-100 flex items-center justify-center mx-auto mb-6">
                  <svg
                    className="w-8 h-8 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">
                  Community events
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Invites to public and Mox members-only events
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-slate-100 flex items-center justify-center mx-auto mb-6">
                  <svg
                    className="w-8 h-8 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-3 text-gray-900">
                  Fast-track
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Fast-tracked application for full Mox membership
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Partner organizations */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-8 text-center font-display">
            Our partners include
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-4xl mx-auto">
            <PartnerCard
              name="Lightcone"
              url="https://www.lightconeinfrastructure.com//"
              logoUrl="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRhOH11gCJ3CAw29-65rmtWj5zxTvRWPxNqaw&s"
              bgColor="bg-white"
            />
            <PartnerCard
              name="ACX Grants"
              url="https://manifund.org/acx-grants"
              logoUrl="/logos/acx.jpg"
              bgColor="bg-[#0b1530]"
            />
            <PartnerCard
              name="MIRI"
              url="https://intelligence.org/"
              logoUrl="https://intelligence.org/wp-content/uploads/2024/10/Group-47.svg"
              bgColor="bg-[#193655]"
            />
            <PartnerCard
              name="FAR.AI"
              url="https://far.ai/"
              logoUrl="https://cdn.prod.website-files.com/66f4503c3d0f4d4a75074a18/6712bf27e843ab5a68396da8_Far%20AI%20Logotype%20White.svg"
              bgColor="bg-[#071024]"
            />
            <PartnerCard
              name="Seldon"
              url="https://seldonlab.com/"
              logoUrl="https://framerusercontent.com/images/3A382BHGbO43XAm4KL9Av9HtAQ.png"
              bgColor="bg-white"
            />
            <PartnerCard
              name="GovAI"
              url="https://governance.ai"
              logoUrl="/logos/govai.png"
              bgColor="bg-white"
            />
            <PartnerCard
              name="ARC"
              url="https://www.alignment.org/"
              logoUrl="https://www.alignment.org/assets/img/arc-logo.svg"
              bgColor="bg-white"
            />
            <PartnerCard
              name="Redwood"
              url="https://redwoodresearch.org"
              logoUrl="/logos/redwood.svg"
              bgColor="bg-white"
            />
            <PartnerCard
              name="Elicit"
              url="https://elicit.com"
              logoUrl="https://i.imgur.com/NghnGgl.jpeg"
              bgColor="bg-[#00666d]"
            />
            <PartnerCard
              name="Palisade Research"
              url="https://palisaderesearch.org/"
              logoUrl="/logos/palisade.svg"
              bgColor="bg-white"
            />
            <PartnerCard
              name="AI Impacts"
              url="https://aiimpacts.org/"
              logoUrl="/logos/aiimpacts.png"
              bgColor="bg-[#2c97cc]"
            />
            <PartnerCard
              name="Roots of Progress"
              url="https://rootsofprogress.org/"
              logoUrl="/ROP7594_Profile-Picture.webp"
              bgColor="bg-white"
            />
            <PartnerCard
              name="Epoch"
              url="https://epoch.ai/"
              logoUrl="/logos/epoch.jpg"
              bgColor="bg-[#eaf5f4]"
            />
            <PartnerCard
              name="Timaeus"
              url="https://timaeus.co/"
              logoUrl="/logos/timaeus.png"
              bgColor="bg-white"
            />
            <PartnerCard
              name="BlueDot Impact"
              url="https://bluedot.org/"
              logoUrl="https://bluedot.org/images/logo/BlueDot_Impact_Logo_White.svg"
              bgColor="bg-[#00104e]"
            />
            <PartnerCard
              name="Sentient Futures"
              url="https://www.sentientfutures.ai/"
              logoUrl="https://images.squarespace-cdn.com/content/v1/688ec3cb2608393cd4dacb49/91d99e3b-8e0f-4c7d-9a44-45e2e283bf60/3+%5Bmain%5Dhorizontal-starry%404x.png?format=1500w"
              bgColor="bg-white"
            />
          </div>
        </section>

        {/* CTA sections */}
        <div className="grid md:grid-cols-1 gap-8 mb-20 max-w-2xl mx-auto">
          {/* For Organizations */}
          <div className="bg-white p-8 border border-amber-700 shadow-lg">
            <h2 className="text-2xl font-bold mb-4 font-display">
              Partner with Mox
            </h2>
            <p className="text-gray-600 mb-6">
              A place for your team to work and collaborate, in the heart of SF.
            </p>
            <div className="space-y-3 mb-6 text-sm text-gray-700">
              {[
                'Ample desks, monitors, and call booths',
                'Conference rooms and lounges ',
                'Host talks, retreats, and hackathons with us',
              ].map((text) => (
                <div className="flex items-center" key={text}>
                  <svg
                    className="w-4 h-4 text-green-500 mr-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <a
              href="mailto:robin@moxsf.com?subject=Guest Program Partnership"
              className="inline-block px-6 py-3 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-colors"
            >
              Partner with us
            </a>
          </div>

          {/* For Individuals */}
          {/* <div className="bg-white p-8 border border-amber-700 shadow-lg">
            <h2 className="text-2xl font-bold mb-4 font-display">
              For individuals
            </h2>
            <p className="text-gray-600 mb-6">
              Join through one of our partner organizations or reach out
              directly if you're working on AI safety.
            </p>
            <div className="space-y-3 mb-6 text-sm text-gray-700">
              <div className="flex items-center">
                <svg
                  className="w-4 h-4 text-green-500 mr-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Professional coworking environment</span>
              </div>
              <div className="flex items-center">
                <svg
                  className="w-4 h-4 text-green-500 mr-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Access to talks and community events</span>
              </div>
              <div className="flex items-center">
                <svg
                  className="w-4 h-4 text-green-500 mr-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Path to full membership</span>
              </div>
            </div>
            <a
              href="mailto:robin@moxsf.com?subject=Guest Program Interest"
              className="inline-block px-6 py-3 bg-amber-800 text-white font-semibold hover:bg-amber-900 transition-colors"
            >
              Get in touch
            </a>
          </div> */}
        </div>

        {/* Testimonials section */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-8 text-center font-display">
            What people say about Mox
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <TestimonialCard
              name="Gavriel Kleinwaks, Mox member"
              quote="I think of people at Mox as a collection of my friends and not-yet-friends. Nobody feels entirely like a stranger. Mox members are (of course) smart, but they're also so open and approachable. I can walk up to anyone and have an interesting conversation; every single person I've met here has welcomed questions about their work and been curious about mine."
            />
            <TestimonialCard
              name="Andreas Stuhlmüller, Elicit"
              quote="Mox was an amazing space for the AI for Epistemics hackathon. I loved the thoughtful layout with central communal gathering areas and quiet work areas around the edges, easily enough space for the 40+ participants."
            />
            <TestimonialCard
              name="Venki Kumar, Mox member"
              quote="Mox has the best density of people with the values & capabilities I care about the most. In general, it's more social & feels better organized for serendipity vs any coworking space I've been to before, comparable to perhaps like 0.3 Manifests per month."
            />
            <TestimonialCard
              name="Xander Balwit, Asimov Press"
              quote="Austin and his staff have gone to great lengths to make Mox incredibly accommodating. Not only is the space already equipped with useful things like utensils, printers, and AV, but the operational staff are communicative, flexible, and incredibly helpful.... I definitely hope to find occasions to host more events at Mox down the line, and would highly recommend it to anyone I know who is looking for a slightly more casual, but exceedingly well-managed venue."
            />
            {/* <TestimonialCard
              name="Sawyer Bernath, Tarbell Fellowship"
              quote="Mox is a spacious and welcoming coworking space, with kind, helpful staff. We would be happy to host an event there again."
            /> */}
          </div>
        </section>

        {/* Why this program section */}
        {/* <section className="mb-20">
          <div className="bg-amber-50 p-8 border-l-4 border-amber-800">
            <h2 className="text-2xl font-bold mb-6 font-display">
              Why this guest program?
            </h2>
            <div className="space-y-4 text-gray-700">
              <div className="flex items-start">
                <span className="text-amber-800 mr-3 mt-1">•</span>
                <p>
                  Some people work elsewhere, but occasionally visit SF and want
                  a place to work
                </p>
              </div>
              <div className="flex items-start">
                <span className="text-amber-800 mr-3 mt-1">•</span>
                <p>
                  Some people have offices, but want a community space to access
                  on weekends
                </p>
              </div>
              <div className="flex items-start">
                <span className="text-amber-800 mr-3 mt-1">•</span>
                <p>
                  Mox exists to help people exchange ideas; we're always looking
                  for more great folks!
                </p>
              </div>
            </div>
          </div>
        </section> */}

        {/* Resources section */}
        <section className="mb-20">
          <h2 className="text-2xl font-bold mb-8 text-center font-display">
            Resources for guests
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-6 border border-amber-700">
              <h3 className="text-lg font-semibold mb-4">Getting Started</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <strong>First time guide:</strong>{' '}
                  <Link href="https://moxsf.notion.site/visiting-mox">
                    Visiting Mox
                  </Link>
                </div>
                <div>
                  <strong>Check out events:</strong>{' '}
                  <Link href="https://moxsf.com/events">moxsf.com/events</Link>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 border border-amber-700">
              <h3 className="text-lg font-semibold mb-4">
                Contact Information
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <strong>Contact email:</strong>{' '}
                  <Link href="mailto:robin@moxsf.com">robin@moxsf.com</Link>
                </div>
                <div>
                  <strong>Emergency phone:</strong>{' '}
                  <span className="font-mono text-gray-700">415-941-0105</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <Gallery />
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-24 border-t border-amber-700 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-gray-500">
          <Link href="/">← Back to Mox homepage</Link>
          <br />
          Questions? Contact{' '}
          <Link href="mailto:robin@moxsf.com">robin@moxsf.com</Link>
        </div>
      </footer>
    </div>
  )
}
