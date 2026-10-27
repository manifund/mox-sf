'use client'

import { useState } from 'react'
import NextImage from 'next/image'

type EventCategory = 'small' | 'large' | 'hackathon' | null

// Amenity Components
function SmallEventAmenities() {
  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      <AmenityItem text="Flexible seating arrangements for 10-40 guests" />
      <AmenityItem text="Multiple breakout rooms for small group discussions" />
      <AmenityItem text="Whiteboard walls and collaboration tools" />
      <AmenityItem text="High-quality coffee, tea, and light refreshments" />
      <AmenityItem text="Professional AV equipment and wireless presentation" />
      <AmenityItem text="Fast, reliable WiFi throughout" />
      <AmenityItem text="Phone booths for private calls" />
      <AmenityItem text="Natural light and comfortable ambiance" />
    </div>
  )
}

function LargeEventAmenities() {
  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      <AmenityItem text="Main event space accommodating 50-150 people" />
      <AmenityItem text="Theater-style or networking layout options" />
      <AmenityItem text="Professional sound system and microphones" />
      <AmenityItem text="Large projection screen and presentation tech" />
      <AmenityItem text="Dedicated registration and welcome area" />
      <AmenityItem text="Industrial-grade WiFi supporting 100+ devices" />
      <AmenityItem text="Catering kitchen and serving areas" />
      <AmenityItem text="Multiple restrooms and accessibility features" />
      <AmenityItem text="Optional breakout rooms for parallel sessions" />
    </div>
  )
}

function HackathonAmenities() {
  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      <AmenityItem text="24/7 access throughout your event" />
      <AmenityItem text="Dedicated workspace with desks and monitors" />
      <AmenityItem text="High-speed internet (1Gbps+)" />
      <AmenityItem text="Multiple collaboration areas and quiet zones" />
      <AmenityItem text="Full kitchen access for extended hours" />
      <AmenityItem text="Coffee, snacks, and refreshments" />
      <AmenityItem text="Whiteboards, monitors, and presentation areas" />
      <AmenityItem text="Comfortable seating for long working sessions" />
      <AmenityItem text="Phone booths and private meeting rooms" />
      <AmenityItem text="On-call tech support" />
      <AmenityItem text="Secure overnight storage" />
    </div>
  )
}

function GeneralAmenities() {
  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      <AmenityItem text="Professional AV equipment" />
      <AmenityItem text="High-speed internet" />
      <AmenityItem text="Flexible seating arrangements" />
      <AmenityItem text="Kitchen and catering support" />
      <AmenityItem text="Whiteboards and collaboration tools" />
      <AmenityItem text="Comfortable, well-designed space" />
    </div>
  )
}

function AmenityItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-brand dark:text-brand-dark-mode text-xl mt-0.5">
        ✓
      </span>
      <span className="text-text-secondary dark:text-text-secondary-dark">
        {text}
      </span>
    </div>
  )
}

// Area Components
interface AreaGalleryProps {
  images: string[]
  name: string
}

function AreaGallery({ images, name }: AreaGalleryProps) {
  return (
    <div className="space-y-1">
      {/* Top row: 2 large square-ish photos */}
      <div className="grid grid-cols-2 gap-1">
        {images.slice(0, 2).map((image, index) => (
          <div
            key={index}
            className="relative aspect-square bg-gray-300 overflow-hidden"
          >
            {image.startsWith('/images/') ? (
              <NextImage
                src={image}
                alt={`${name} ${index + 1}`}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                Photo {index + 1}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Bottom row: 4 smaller photos */}
      <div className="grid grid-cols-4 gap-1">
        {images.slice(2, 6).map((image, index) => (
          <div
            key={index + 2}
            className="relative aspect-video bg-gray-300 overflow-hidden"
          >
            {image.startsWith('/images/') ? (
              <NextImage
                src={image}
                alt={`${name} ${index + 3}`}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                Photo {index + 3}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface AreaSectionProps {
  name: string
  capacity: string
  floor: string
  description: string
  images: string[]
  features?: string[]
}

function AreaSection({
  name,
  capacity,
  floor,
  description,
  images,
  features,
}: AreaSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-800 p-8 shadow-lg border border-slate-200 dark:border-gray-700">
      <div className="grid lg:grid-cols-[1fr_2fr] gap-8">
        <div>
          <h3 className="text-2xl font-bold mb-2 font-display text-amber-900 dark:text-amber-400">
            {name}
          </h3>
          <div className="flex gap-4 mb-4 text-sm">
            <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-semibold">
              {capacity}
            </span>
            <span className="px-3 py-1 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300">
              {floor}
            </span>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{description}</p>
          {features && features.length > 0 && (
            <ul className="space-y-2">
              {features.map((feature, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-text-tertiary dark:text-text-tertiary-dark"
                >
                  <span className="text-brand dark:text-brand-dark-mode">
                    •
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <AreaGallery images={images} name={name} />
        </div>
      </div>
    </div>
  )
}

// Area-specific components
function LibraryArea() {
  return (
    <AreaSection
      name="Library"
      capacity="10-15 people"
      floor="4th Floor"
      description="An intimate, quiet space perfect for small workshops, breakout sessions, or focused discussions. Features comfortable seating and a contemplative atmosphere."
      images={['gray', 'gray', 'gray', 'gray', 'gray', 'gray']}
      features={[
        'Comfortable lounge seating',
        'Natural lighting',
        'Whiteboard available',
        'Perfect for intimate conversations',
      ]}
    />
  )
}

function DiningHallArea() {
  return (
    <AreaSection
      name="Dining Hall"
      capacity="40-60 people"
      floor="3rd Floor"
      description="A bright, modern space ideal for seated meals, panel discussions, or collaborative workshops. The long tables encourage conversation and community."
      images={['gray', 'gray', 'gray', 'gray', 'gray', 'gray']}
      features={[
        'Long communal tables',
        'Large windows with natural light',
        'Adjacent to kitchen facilities',
        'Configurable seating arrangements',
      ]}
    />
  )
}

function LoungeArea() {
  return (
    <AreaSection
      name="Lounge"
      capacity="150-200 people"
      floor="4th Floor"
      description="Our largest and most versatile space. With an open floor plan and modern design, the lounge can accommodate everything from large conferences to networking events to hackathons."
      images={['gray', 'gray', 'gray', 'gray', 'gray', 'gray']}
      features={[
        'Open floor plan with flexible configurations',
        'Modern furnishings and decor',
        'Large capacity for standing or seated events',
        'Multiple power outlets throughout',
        'Can be combined with adjacent spaces',
      ]}
    />
  )
}

function AuditoriumArea() {
  return (
    <AreaSection
      name="Auditorium"
      capacity="100-120 people"
      floor="4th Floor"
      description="A dedicated presentation space with theater-style seating, professional AV setup, and excellent acoustics. Perfect for talks, screenings, and formal presentations."
      images={['gray', 'gray', 'gray', 'gray', 'gray', 'gray']}
      features={[
        'Theater-style seating',
        'Built-in projection and sound system',
        'Podium and stage area',
        'Excellent acoustics',
        'Recording-ready setup',
      ]}
    />
  )
}

function CoworkingArea() {
  return (
    <AreaSection
      name="Coworking Space"
      capacity="30-50 people"
      floor="Multiple Floors"
      description="Dedicated desk space with monitors and power at every seat. Ideal for hackathons and extended work sessions where participants need focused workspace."
      images={['gray', 'gray', 'gray', 'gray', 'gray', 'gray']}
      features={[
        'Individual desks with monitors',
        'High-speed internet at every seat',
        'Power outlets and charging stations',
        'Ergonomic chairs',
        'Mix of collaborative and quiet zones',
      ]}
    />
  )
}

function BreakoutRoomsArea() {
  return (
    <AreaSection
      name="Breakout Rooms (4x)"
      capacity="4-8 people each"
      floor="3rd & 4th Floors"
      description="Four private meeting rooms distributed across our floors. Each room is equipped for small group work, video calls, or private discussions."
      images={['gray', 'gray', 'gray', 'gray', 'gray', 'gray']}
      features={[
        'Four separate rooms available',
        'Whiteboards in each room',
        'Video conferencing capable',
        'Sound-dampened for privacy',
        'Comfortable seating',
      ]}
    />
  )
}

interface EventType {
  id: EventCategory
  name: string
  description: string
  capacity: string
}

interface PastEvent {
  name: string
  type: EventCategory
  attendees: number
  image?: string
  organizer: string
  description: string
}

interface Testimonial {
  name: string
  organization: string
  eventType: EventCategory
  quote: string
}

const eventTypes: EventType[] = [
  {
    id: 'small',
    name: 'Small Events',
    description:
      'Intimate gatherings, workshops, and community meetups for meaningful connections',
    capacity: '10-40 people',
  },
  {
    id: 'large',
    name: 'Large Events',
    description:
      'Major conferences, talks, and celebrations that bring the community together',
    capacity: '50-150 people',
  },
  {
    id: 'hackathon',
    name: 'Hackathons',
    description:
      'Multi-day innovation sprints with dedicated workspace and round-the-clock support',
    capacity: '30-100 people',
  },
]

const pastEvents: PastEvent[] = [
  {
    name: 'METR AI Safety Hackathon',
    type: 'hackathon',
    attendees: 75,
    image: '/images/006.jpg',
    organizer: 'METR',
    description:
      'A weekend-long hackathon focused on AI safety research and tooling, featured in Wired magazine.',
  },
  {
    name: 'Manifund Demo Day',
    type: 'large',
    attendees: 120,
    image: '/images/003.jpg',
    organizer: 'Manifund',
    description:
      'Pitch presentations from our latest cohort of impact-driven startups and research projects.',
  },
  {
    name: 'AI Alignment Research Workshop',
    type: 'small',
    attendees: 25,
    image: '/images/002.jpg',
    organizer: 'Independent Researchers',
    description:
      'Deep dive working session on technical AI alignment approaches.',
  },
  {
    name: 'EA Global SF Afterparty',
    type: 'large',
    attendees: 150,
    image: '/images/004.jpg',
    organizer: 'Centre for Effective Altruism',
    description:
      'Post-conference celebration bringing together the global EA community.',
  },
  {
    name: 'Startup Sprint Weekend',
    type: 'hackathon',
    attendees: 40,
    image: '/images/007.jpg',
    organizer: 'Various Founders',
    description:
      '48-hour intensive build session for early-stage startup teams.',
  },
  {
    name: 'Prediction Markets Salon',
    type: 'small',
    attendees: 30,
    image: '/images/008.jpg',
    organizer: 'Manifold Markets',
    description:
      'Discussion and debate on the future of forecasting and decision-making.',
  },
]

const testimonials: Testimonial[] = [
  {
    name: 'Sarah Chen',
    organization: 'METR',
    eventType: 'hackathon',
    quote:
      'Mox provided the perfect environment for our AI safety hackathon. The 24/7 access, excellent AV setup, and dedicated workspace made it easy for participants to stay focused and productive throughout the weekend. The staff was incredibly supportive and responsive to our needs.',
  },
  {
    name: 'James Rodriguez',
    organization: 'Anthropic',
    eventType: 'large',
    quote:
      'We hosted a 100-person technical talk at Mox and were impressed by the quality of the space and amenities. The built-in projector and sound system worked flawlessly, and the layout was perfect for both presentations and networking.',
  },
  {
    name: 'Emily Watson',
    organization: 'Open Philanthropy',
    eventType: 'small',
    quote:
      'For intimate workshops, Mox strikes the perfect balance between professional and comfortable. The breakout rooms were ideal for small group discussions, and the overall atmosphere fostered exactly the kind of thoughtful conversation we were hoping for.',
  },
  {
    name: 'Alex Kim',
    organization: 'Independent Organizer',
    eventType: 'large',
    quote:
      'What sets Mox apart is the community. Beyond just renting a space, we felt supported by a network of mission-aligned people who genuinely cared about the success of our event.',
  },
  {
    name: 'David Park',
    organization: 'Startup Founder',
    eventType: 'hackathon',
    quote:
      'The logistics support for our 3-day hackathon was outstanding. From catering coordination to tech support, the Mox team thought of everything so we could focus on the content.',
  },
  {
    name: 'Rachel Green',
    organization: 'Research Institute',
    eventType: 'small',
    quote:
      'Mox has become our go-to venue for research workshops. The space is beautiful, functional, and the price point is unbeatable for the quality you receive.',
  },
]

export default function EventHostingPage() {
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>(null)

  const filteredEvents =
    selectedCategory === null
      ? pastEvents
      : pastEvents.filter((event) => event.type === selectedCategory)

  const filteredTestimonials =
    selectedCategory === null
      ? testimonials
      : testimonials.filter((t) => t.eventType === selectedCategory)

  // Determine which amenities component to show
  const AmenitiesComponent =
    selectedCategory === 'small'
      ? SmallEventAmenities
      : selectedCategory === 'large'
        ? LargeEventAmenities
        : selectedCategory === 'hackathon'
          ? HackathonAmenities
          : GeneralAmenities

  return (
    <div className="min-h-screen bg-background-page dark:bg-background-page-dark text-text-primary dark:text-text-primary-dark">
      {/* Hero / CTA Section */}
      <section className="bg-gradient-to-b from-background-accent dark:from-background-surface-dark to-background-page dark:to-background-page-dark py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-5xl font-bold mb-6 font-display text-brand dark:text-brand-dark-mode">
            Host Your Event at Mox
          </h1>
          <p className="text-xl text-text-secondary dark:text-text-secondary-dark mb-8 max-w-2xl mx-auto">
            A premium event space in San Francisco's Mission District, designed
            for meaningful gatherings. From intimate workshops to major
            conferences, we provide the venue and support you need to create
            something exceptional.
          </p>
          <a
            href="mailto:robin@moxsf.com?subject=Event%20Inquiry"
            className="inline-block px-8 py-4 bg-brand dark:bg-brand text-white font-semibold text-lg hover:bg-brand-dark dark:hover:bg-brand-dark transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Inquire About Hosting
          </a>
        </div>
      </section>

      {/* Event Types Overview */}
      <section className="py-16 bg-background-surface dark:bg-background-surface-dark">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4 text-center font-display text-brand dark:text-brand-dark-mode">
            Event Types
          </h2>
          <p className="text-center text-text-tertiary dark:text-text-tertiary-dark mb-12 max-w-2xl mx-auto">
            Select an event type to see tailored information about amenities,
            past events, and testimonials
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {eventTypes.map((type) => (
              <button
                key={type.id}
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === type.id ? null : type.id
                  )
                }
                className={`p-8 border-2 transition-all duration-200 cursor-pointer text-left ${
                  selectedCategory === type.id
                    ? 'border-strong dark:border-strong bg-background-accent dark:bg-background-subtle-dark shadow-lg'
                    : 'border-border-light dark:border-border-medium-dark bg-background-surface dark:bg-background-surface-dark hover:border-strong-alt dark:hover:border-strong hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-2xl font-bold font-display text-brand dark:text-brand-dark-mode">
                    {type.name}
                  </h3>
                  <span className="px-3 py-1 bg-background-accent dark:bg-brand-dark text-brand dark:text-text-primary-dark text-xs font-semibold whitespace-nowrap ml-2">
                    {type.capacity}
                  </span>
                </div>
                <p className="text-text-secondary dark:text-text-secondary-dark">
                  {type.description}
                </p>
                {selectedCategory === type.id && (
                  <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-700">
                    <span className="text-sm text-brand dark:text-brand-dark-mode font-semibold">
                      ✓ Selected
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {selectedCategory && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-brand dark:text-brand-dark-mode hover:text-brand-dark dark:hover:text-amber-600 underline text-sm cursor-pointer"
              >
                Clear filter to see all events
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Past Events */}
      <section className="py-16 bg-background-page dark:bg-background-page-dark">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4 text-center font-display text-brand dark:text-brand-dark-mode">
            Past Events
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-12">
            {selectedCategory
              ? `${
                  eventTypes.find((t) => t.id === selectedCategory)?.name
                } we've hosted`
              : "A showcase of events we've been proud to host"}
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event, index) => (
              <div
                key={index}
                className="bg-background-surface dark:bg-background-surface-dark shadow-md hover:shadow-xl transition-shadow duration-200 overflow-hidden"
              >
                {event.image && (
                  <div className="relative h-48 w-full">
                    <NextImage
                      src={event.image}
                      alt={event.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-2 font-display text-brand dark:text-brand-dark-mode">
                    {event.name}
                  </h3>
                  <p className="text-sm text-brand dark:text-brand-dark-mode font-semibold mb-2">
                    {event.organizer} • {event.attendees} attendees
                  </p>
                  <p className="text-text-secondary dark:text-text-secondary-dark text-sm">
                    {event.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {filteredEvents.length === 0 && (
            <p className="text-center text-text-muted dark:text-text-muted-dark py-8">
              No events match the selected category
            </p>
          )}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 bg-background-surface dark:bg-background-surface-dark">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4 text-center font-display text-brand dark:text-brand-dark-mode">
            What Organizers Say
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-12">
            {selectedCategory
              ? `Testimonials from ${
                  eventTypes.find((t) => t.id === selectedCategory)?.name
                } organizers`
              : 'Hear from event organizers who chose Mox'}
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {filteredTestimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-background-subtle dark:bg-background-subtle-dark p-8 border-l-4 border-strong dark:border-strong-2xl"
              >
                <p className="text-text-secondary dark:text-text-secondary-dark italic mb-4">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-semibold text-brand dark:text-brand-dark-mode">
                      {testimonial.name}
                    </p>
                    <p className="text-sm text-text-tertiary dark:text-text-tertiary-dark">
                      {testimonial.organization}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredTestimonials.length === 0 && (
            <p className="text-center text-text-muted dark:text-text-muted-dark py-8">
              No testimonials match the selected category
            </p>
          )}
        </div>
      </section>

      {/* Amenities & Services */}
      <section className="py-16 bg-background-accent dark:bg-background-page-dark">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4 text-center font-display text-brand dark:text-brand-dark-mode">
            Amenities & Services
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-12">
            {selectedCategory
              ? `Everything you need for ${
                  eventTypes.find((t) => t.id === selectedCategory)?.name
                }`
              : 'Professional facilities designed for your success'}
          </p>

          <AmenitiesComponent />

          <div className="mt-12 bg-background-surface dark:bg-background-surface-dark p-8 max-w-4xl mx-auto shadow-lg">
            <h3 className="text-2xl font-bold mb-4 font-display text-brand dark:text-brand-dark-mode">
              Additional Services Available
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-brand dark:text-brand-dark-mode mb-2">
                  Event Support
                </h4>
                <ul className="text-sm text-text-secondary dark:text-text-secondary-dark space-y-1">
                  <li>• Setup and breakdown assistance</li>
                  <li>• On-site staff during your event</li>
                  <li>• Tech support and AV troubleshooting</li>
                  <li>• Event planning consultation</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-brand dark:text-brand-dark-mode mb-2">
                  Catering & Hospitality
                </h4>
                <ul className="text-sm text-text-secondary dark:text-text-secondary-dark space-y-1">
                  <li>• Catering coordination with local vendors</li>
                  <li>• Coffee and beverage service</li>
                  <li>• Kitchen access for self-catering</li>
                  <li>• Special dietary accommodations</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Available Spaces */}
      <section className="py-16 bg-background-surface dark:bg-background-surface-dark">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-4 text-center font-display text-brand dark:text-brand-dark-mode">
            Available Spaces
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-12">
            {selectedCategory
              ? `Spaces suitable for ${
                  eventTypes.find((t) => t.id === selectedCategory)?.name
                }`
              : 'A thoughtfully designed 7,000 sq ft venue on Mission Street'}
          </p>

          <div className="space-y-8">
            {/* Library - shown for all event types */}
            <LibraryArea />

            {/* Dining Hall - shown for large events and hackathons */}
            {(selectedCategory === null ||
              selectedCategory === 'large' ||
              selectedCategory === 'hackathon') && <DiningHallArea />}

            {/* Lounge - shown for all event types */}
            <LoungeArea />

            {/* Auditorium - shown for large events and hackathons */}
            {(selectedCategory === null ||
              selectedCategory === 'large' ||
              selectedCategory === 'hackathon') && <AuditoriumArea />}

            {/* Coworking Space - shown only for hackathons */}
            {(selectedCategory === null ||
              selectedCategory === 'hackathon') && <CoworkingArea />}

            {/* Breakout Rooms - shown for all event types */}
            <BreakoutRoomsArea />
          </div>

          {/* Location Details */}
          <div className="mt-16 grid md:grid-cols-2 gap-8">
            <div className="bg-amber-50 dark:bg-gray-700 p-6">
              <h3 className="text-xl font-bold mb-3 font-display text-amber-900 dark:text-amber-400">
                Location & Access
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                <strong>Address:</strong> 1680 Mission Street, San Francisco
              </p>
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                <strong>Transit:</strong> Near 16th St BART, multiple Muni lines
              </p>
              <p className="text-text-secondary dark:text-text-secondary-dark">
                <strong>Parking:</strong> Street parking and nearby garages
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-gray-700 p-6">
              <h3 className="text-xl font-bold mb-3 font-display text-amber-900 dark:text-amber-400">
                Accessibility
              </h3>
              <p className="text-text-secondary dark:text-text-secondary-dark">
                Mox is committed to being an inclusive space. We offer
                wheelchair accessibility, gender-neutral restrooms, and can
                accommodate various accessibility needs. Please let us know how
                we can best support your event.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section className="py-16 bg-background-page dark:bg-background-page-dark">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-8 text-center font-display text-amber-900 dark:text-amber-400">
            Gallery
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              '/images/003.jpg',
              '/images/006.jpg',
              '/images/002.jpg',
              '/images/007.jpg',
              '/images/004.jpg',
              '/images/008.jpg',
            ].map((image, index) => (
              <div
                key={index}
                className="relative aspect-video overflow-hidden"
              >
                <NextImage
                  src={image}
                  alt={`Mox space ${index + 1}`}
                  fill
                  className="object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA & Contact */}
      <section className="py-20 bg-brand-dark dark:bg-brand-dark text-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-6 font-display">
            Ready to Host Your Event?
          </h2>
          <p className="text-xl mb-8 text-text-primary-dark dark:text-text-primary-dark">
            Let's discuss how Mox can support your vision. We'd love to hear
            about your event and explore whether we're the right fit.
          </p>

          {/* Member Link */}
          <div className="mb-8 pb-8 border-b border-strong dark:border-strong">
            <p className="text-text-primary-dark dark:text-text-primary-dark mb-4">
              Already a member wanting to run a small free event?
            </p>
            <a
              href="/portal"
              className="inline-block px-6 py-3 bg-background-surface dark:bg-background-surface-dark text-brand dark:text-brand-dark-mode font-semibold hover:bg-background-subtle dark:hover:bg-background-subtle-dark transition-all duration-200"
            >
              Go to Member Portal →
            </a>
          </div>

          <div className="bg-background-surface dark:bg-background-surface-dark text-text-primary dark:text-text-primary-dark p-8 max-w-2xl mx-auto shadow-2xl relative">
            <h3 className="text-2xl font-bold mb-6 font-display text-brand dark:text-brand-dark-mode">
              Get in Touch
            </h3>

            <div className="space-y-4 mb-6">
              <p className="text-text-secondary dark:text-text-secondary-dark">
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:robin@moxsf.com"
                  className="text-brand dark:text-brand-dark-mode hover:text-brand-dark dark:hover:text-amber-600 underline"
                >
                  robin@moxsf.com
                </a>
              </p>
              <p className="text-text-secondary dark:text-text-secondary-dark">
                <strong>What to include:</strong> Event date, expected
                attendance, event type/purpose, and any specific requirements
              </p>
            </div>

            <a
              href="mailto:robin@moxsf.com?subject=Event%20Inquiry&body=Hi!%20I'm%20interested%20in%20hosting%20an%20event%20at%20Mox.%0A%0AEvent%20Date:%20%0AExpected%20Attendance:%20%0AEvent%20Type:%20%0AAdditional%20Details:%20"
              className="inline-block w-full px-8 py-4 bg-brand dark:bg-brand text-white font-semibold hover:bg-brand-dark dark:hover:bg-brand-dark transition-all duration-200"
            >
              Send Event Inquiry
            </a>

            <p className="text-sm text-text-tertiary dark:text-text-tertiary-dark mt-4">
              We typically respond within 24 hours
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-strong dark:border-strong">
            <h4 className="text-lg font-semibold mb-4 text-text-primary-dark dark:text-text-primary-dark">
              Pricing & Booking
            </h4>
            <p className="text-text-primary-dark dark:text-text-primary-dark max-w-2xl mx-auto">
              Our pricing is designed to be accessible for mission-aligned
              organizations. Rates vary based on event type, duration, and
              services needed. We offer special rates for nonprofits, research
              organizations, and community events. Contact us for a custom
              quote.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-light dark:border-border-light-dark py-8 bg-background-surface dark:bg-background-surface-dark">
        <div className="max-w-4xl mx-auto px-6 text-center text-text-muted dark:text-text-muted-dark">
          <p className="mb-2">
            A project of{' '}
            <a
              href="https://manifund.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
            >
              Manifund
            </a>
          </p>
          <p>
            <a
              href="/"
              className="text-amber-800 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 underline decoration-dotted underline-offset-2"
            >
              Back to main site
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
