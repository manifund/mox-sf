import Image from 'next/image'
import { Suspense } from 'react'
import Gallery from './venue-gallery'
import PeopleGallery from './people-gallery'
import EventsCardCompact from './components/EventsCardCompact'
import { getEvents } from './lib/events'
import DonateBanner from './components/DonateBanner'
import { getPeople, getOrgs, getPrograms, getStaff, buildDirectoryData } from './people/people'
import DirectoryClient from './people/DirectoryClient'
import './people/people.css'

// Without this hint next/image serves a 3840px variant at every viewport.
const CARD_IMAGE_SIZES =
  '(min-width: 1024px) 420px, (min-width: 768px) 192px, 100vw'

async function HomepageDirectory() {
  let people: Awaited<ReturnType<typeof getPeople>> = []
  let orgsMap: Awaited<ReturnType<typeof getOrgs>> = new Map()
  let programsMap: Awaited<ReturnType<typeof getPrograms>> = new Map()
  let staffEntries: Awaited<ReturnType<typeof getStaff>> = []
  try {
    ;[people, orgsMap, programsMap] = await Promise.all([
      getPeople(), getOrgs(), getPrograms(),
    ])
    staffEntries = await getStaff(people)
  } catch (e) {
    console.error('Failed to fetch people data:', e)
  }
  const { sections, orgsLookup, programsLookup } = buildDirectoryData(
    people, orgsMap, programsMap, staffEntries
  )

  return (
    <DirectoryClient
      sections={sections}
      orgsLookup={orgsLookup}
      programsLookup={programsLookup}
      memberCount={people.length}
    />
  )
}

function DirectoryFallback() {
  return (
    <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
      loading members…
    </div>
  )
}


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
      className={`text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2 ${className}`}
    >
      {children}
    </a>
  )
}

export default async function Component() {
  let events: Awaited<ReturnType<typeof getEvents>> = []
  try {
    events = await getEvents()
  } catch (e) {
    console.error('Failed to fetch events:', e)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Donate banner */}
      {/* <DonateBanner /> */}

      {/* Hero section */}
      <div className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 py-12 sm:py-16 pb-12 sm:pb-16 bg-gray-50 dark:bg-gray-900">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10 dark:invert"
          style={{
            backgroundImage: 'url(/images/mox_sketch.png)',
            maskImage:
              'linear-gradient(to bottom, black 60%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black 60%, transparent 100%)',
          }}
        />
        <div className="relative z-10 max-w-7xl w-full">
          <div className="text-center mb-12">
            <img
              src="/images/mox_logo_text.svg"
              alt="Mox"
              className="mx-auto mb-8 w-full max-w-md dark:invert dark:opacity-90"
            />
            <p className="text-xl mb-4 leading-relaxed text-gray-700 dark:text-gray-200">
              A research-focused incubator & community space for{' '}
              <b>
                <em>doers of good</em>
              </b>{' '}
              and{' '}
              <b>
                <em>masters of craft</em>
              </b>
              .
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300">
              <Link
                href="https://maps.google.com/?q=Mox+1680+Mission+St+San+Francisco"
                className="dark:!text-gray-300 dark:hover:!text-gray-100"
              >
                1680 Mission Street, San Francisco
              </Link>
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Events column */}
            <div className="bg-white dark:bg-gray-800 bg-opacity-95 dark:bg-opacity-95 shadow-xl flex flex-col md:flex-row lg:flex-col overflow-hidden">
              <Image
                src="/images/014.jpg"
                alt="Mox events"
                width={4032}
                height={3024}
                priority
                sizes={CARD_IMAGE_SIZES}
                className="w-full md:w-48 lg:w-full h-48 md:h-auto lg:h-48 object-cover flex-shrink-0"
              />
              <div className="p-4 sm:p-6 flex flex-col flex-1">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-display mb-4 text-center">
                  Upcoming events
                </h3>
                <div className="flex-1">
                  <EventsCardCompact events={events} />
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <a
                    href="/events"
                    className="block text-center text-sm text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
                  >
                    All events →
                  </a>
                </div>
              </div>
            </div>

            {/* People column */}
            <div className="bg-white dark:bg-gray-800 bg-opacity-95 dark:bg-opacity-95 shadow-xl flex flex-col md:flex-row lg:flex-col overflow-hidden">
              <Image
                src="/images/023.jpg"
                alt="Mox community"
                width={2000}
                height={1333}
                priority
                sizes={CARD_IMAGE_SIZES}
                className="w-full md:w-48 lg:w-full h-48 md:h-auto lg:h-48 object-cover flex-shrink-0"
              />
              <div className="p-4 sm:p-6 flex flex-col flex-1">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-display mb-4 text-center">
                  Who we gather
                </h3>

                <div className="flex flex-wrap justify-center gap-1.5 flex-1">
                  {[
                    'Startup founders',
                    'Effective altruists',
                    'Alignment researchers',
                    'Filmmakers',
                    'Writers',
                    'Musicians',
                    'Community builders',
                    'Hackers',
                    'Designers',
                    'Gamers',
                  ].map((label) => (
                    <div
                      key={label}
                      className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1 flex items-center"
                    >
                      <p className="text-gray-900 dark:text-gray-300 text-sm whitespace-nowrap leading-tight">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <a
                    href="/people"
                    className="block text-center text-sm text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
                  >
                    See people →
                  </a>
                </div>
              </div>
            </div>

            {/* Membership column */}
            <div className="bg-white dark:bg-gray-800 bg-opacity-95 dark:bg-opacity-95 shadow-xl flex flex-col md:flex-row lg:flex-col overflow-hidden">
              <Image
                src="/images/003.jpg"
                alt="Mox space"
                width={1512}
                height={1009}
                priority
                sizes={CARD_IMAGE_SIZES}
                className="w-full md:w-48 lg:w-full h-48 md:h-auto lg:h-48 object-cover flex-shrink-0"
              />
              <div className="p-4 sm:p-6 flex flex-col flex-1">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white font-display mb-6 text-center">
                  Space for meaningful work
                </h3>

                <div className="flex flex-col gap-2 flex-1">
                  <a
                    href="/membership"
                    className="px-6 py-3 text-sm text-center bg-amber-900 dark:bg-slate-500 text-white hover:bg-amber-800 dark:hover:bg-amber-400 transition-colors"
                  >
                    Apply for membership
                  </a>
                  <a
                    href="/offices"
                    className="px-6 py-3 text-sm text-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-650 transition-colors"
                  >
                    Inquire about offices
                  </a>
                  <a
                    href="/day-pass"
                    className="px-6 py-3 text-sm text-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-650 transition-colors"
                  >
                    Buy a day pass
                  </a>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <a
                    href="/portal/login"
                    className="block text-center text-sm text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
                  >
                    Member portal →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <section className="mb-12 sm:mb-16">
          <PeopleGallery />
        </section>
      </div>

      {/* Guest Programs / Partner Orgs */}
      <div className="mb-12 py-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white font-display mb-4 text-center">
            Partner Orgs
          </h2>
          <p className="text-center text-gray-700 dark:text-gray-300 text-sm mb-8">
            Learn more about our{' '}
            <a
              href="https://moxsf.com/guest-program"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
            >
              guest program
            </a>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <a
              href="https://manifund.org/acx-grants"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#0b1530] hover:bg-[#081025] transition-all duration-200 flex items-center justify-center overflow-hidden p-3 gap-3"
            >
              <img
                src="/logos/acx.jpg"
                alt="ACX Grants logo"
                className="h-full w-auto object-contain"
              />
              <span className="text-2xl text-white uppercase font-sans tracking-wide">
                ACX Grants
              </span>
            </a>

            <a
              href="https://intelligence.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#193655] hover:bg-[#142b44] transition-all duration-200 flex items-center justify-center p-3"
            >
              <img
                src="https://intelligence.org/wp-content/uploads/2024/10/Group-47.svg"
                alt="MIRI logo"
                className="h-full w-auto object-contain"
              />
            </a>

            <a
              href="https://far.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#071024] hover:bg-[#050b1a] transition-all duration-200 flex items-center justify-center p-3"
            >
              <img
                src="https://cdn.prod.website-files.com/66f4503c3d0f4d4a75074a18/6712bf27e843ab5a68396da8_Far%20AI%20Logotype%20White.svg"
                alt="FAR.AI logo"
                className="h-full w-auto object-contain"
              />
            </a>

            <a
              href="https://elicit.com"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#00666d] hover:bg-[#005259] transition-all duration-200 flex items-center justify-center p-3 gap-2"
            >
              <img
                src="https://i.imgur.com/NghnGgl.jpeg"
                alt="Elicit logo"
                className="h-full w-auto object-contain"
              />
              <span className="text-2xl text-white uppercase font-sans tracking-wide">
                Elicit
              </span>
            </a>

            <a
              href="https://aiimpacts.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#2c97cc] hover:bg-[#2383b3] transition-all duration-200 flex items-center justify-center p-3 gap-2"
            >
              <img
                src="/logos/aiimpacts.png"
                alt="AI Impacts logo"
                className="h-full w-auto object-contain"
              />
              <span className="text-2xl text-white uppercase font-sans tracking-wide">
                Impacts
              </span>
            </a>

            <a
              href="https://rootsofprogress.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#5e6f60] hover:bg-[#4d5c4f] transition-all duration-200 flex items-center justify-center p-3 gap-2"
            >
              <img
                src="/ROP7594_Profile-Picture.webp"
                alt="Roots of Progress logo"
                className="h-4/5 w-auto object-contain"
              />
              <span className="text-xl text-white uppercase font-sans tracking-tight leading-none">
                Roots of Progress
              </span>
            </a>

            <a
              href="https://epoch.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#eaf5f4] hover:bg-[#d5e8e6] transition-all duration-200 flex items-center justify-center p-3 gap-2"
            >
              <img
                src="/logos/epoch.jpg"
                alt="Epoch logo"
                className="h-full w-auto object-contain"
              />
              <span className="text-2xl text-gray-900 uppercase font-sans tracking-wide">
                Epoch
              </span>
            </a>

            <a
              href="https://bluedot.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-[#00104e] hover:bg-[#000c3d] transition-all duration-200 flex items-center justify-center p-3"
            >
              <img
                src="https://bluedot.org/images/logo/BlueDot_Impact_Logo_White.svg"
                alt="BlueDot Impact logo"
                className="h-full w-auto object-contain"
              />
            </a>

            <a
              href="https://www.lightconeinfrastructure.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center p-3 gap-2 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRhOH11gCJ3CAw29-65rmtWj5zxTvRWPxNqaw&s"
                alt="Lightcone logo"
                className="h-full w-auto object-contain dark:invert dark:mix-blend-plus-lighter"
              />
              <span className="text-2xl text-gray-900 dark:text-white uppercase font-sans tracking-wide">
                Lightcone
              </span>
            </a>

            <a
              href="https://seldonlab.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center p-3 gap-2 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="https://framerusercontent.com/images/3A382BHGbO43XAm4KL9Av9HtAQ.png"
                alt="Seldon logo"
                className="h-full w-auto object-contain dark:invert dark:mix-blend-plus-lighter"
              />
              <span className="text-2xl text-gray-900 dark:text-white uppercase font-sans tracking-wide">
                Seldon
              </span>
            </a>

            <a
              href="https://governance.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center p-3 gap-2 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="/logos/govai.png"
                alt="GovAI logo"
                className="h-full w-auto object-contain dark:invert"
              />
              <span className="text-2xl text-gray-900 dark:text-white uppercase font-sans tracking-wide">
                GovAI
              </span>
            </a>

            <a
              href="https://www.alignment.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center p-3 gap-2 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="https://www.alignment.org/assets/img/arc-logo.svg"
                alt="ARC logo"
                className="h-full w-auto object-contain dark:invert"
              />
              <span className="text-2xl text-gray-900 dark:text-white uppercase font-sans tracking-wide">
                ARC
              </span>
            </a>

            <a
              href="https://redwoodresearch.org"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center p-3 gap-2 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="/logos/redwood.svg"
                alt="Redwood logo"
                className="h-full w-auto object-contain dark:brightness-0 dark:invert"
              />
              <span className="text-2xl text-gray-900 dark:text-white uppercase font-sans tracking-wide">
                Redwood
              </span>
            </a>

            <a
              href="https://palisaderesearch.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center p-3 gap-2 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="/logos/palisade.svg"
                alt="Palisade Research logo"
                className="h-full w-auto object-contain dark:invert"
              />
              <span className="text-2xl text-gray-900 dark:text-white uppercase font-sans tracking-wide">
                Palisade
              </span>
            </a>

            <a
              href="https://timaeus.co/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center p-3 gap-2 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="https://i.imgur.com/rvjRkHZ.png"
                alt="Timaeus logo"
                className="h-full w-auto object-contain dark:invert dark:mix-blend-plus-lighter"
              />
              <span className="text-2xl text-gray-900 dark:text-white uppercase font-sans tracking-wide">
                Timaeus
              </span>
            </a>

            <a
              href="https://www.sentientfutures.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-[3/1] bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all duration-200 flex items-center justify-center overflow-hidden p-3 border border-gray-200 dark:border-gray-600"
            >
              <img
                src="https://images.squarespace-cdn.com/content/v1/688ec3cb2608393cd4dacb49/91d99e3b-8e0f-4c7d-9a44-45e2e283bf60/3+%5Bmain%5Dhorizontal-starry%404x.png?format=1500w"
                alt="Sentient Futures logo"
                className="h-full w-auto object-contain"
              />
            </a>
          </div>
        </div>
      </div>

      {/* The Space section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <section className="mb-12 sm:mb-16">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white font-display mb-2">
              The Space
            </h2>
          </div>
          <Gallery />
        </section>
      </div>

      {/* People directory */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <section className="mb-12 sm:mb-16">
          <div className="directory homepage-directory">
            <Suspense fallback={<DirectoryFallback />}>
              <HomepageDirectory />
            </Suspense>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-16 sm:mt-24 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            A project of <Link href="https://manifund.org">Manifund</Link>
            {' · '}
            <a
              href="/donate"
              className="text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
            >
              Donate
            </a>
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Questions? Contact{' '}
            <Link href="mailto:robin@moxsf.com">robin@moxsf.com</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
