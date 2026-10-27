'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import styles from './gef.module.css'

const marqueeWords = [
  'Research',
  'Founders',
  'San Francisco',
  'Global Experts',
  'Mox',
  'Impact',
  'Mission',
  'Community',
]

export default function GefLanding() {
  const marqueeTrackRef = useRef<HTMLDivElement>(null)
  const [formMessage, setFormMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const track = marqueeTrackRef.current
    if (!track || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const updateMarquee = () => {
      const halfWidth = track.scrollWidth / 2
      if (!halfWidth) return

      const offset = (window.scrollY * 0.32) % halfWidth
      track.style.transform = `translateX(${-offset}px)`
    }

    updateMarquee()
    window.addEventListener('scroll', updateMarquee, { passive: true })
    window.addEventListener('resize', updateMarquee)

    return () => {
      window.removeEventListener('scroll', updateMarquee)
      window.removeEventListener('resize', updateMarquee)
    }
  }, [])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = Object.fromEntries(formData.entries())

    setSubmitting(true)
    setFormMessage('Sending your interest...')

    try {
      const response = await fetch('/gef/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setFormMessage(
          data.error || 'Something went wrong. Please try again in a moment.'
        )
        return
      }

      form.reset()
      setSubmitted(true)
      setFormMessage(
        'Thanks! Your interest is on its way. We’ll be in touch about next steps.'
      )
    } catch {
      setFormMessage('Could not reach the server. Please try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.gefPage} id="top">
      <div className={styles.grain} aria-hidden="true" />
      <header className={styles.siteHeader} aria-label="Primary navigation">
        <a className={styles.brand} href="#top" aria-label="Mox Global Expert Fellowship home">
          <span className={styles.brandLogo}>
            <img src="/images/mox_logo_text.svg" alt="Mox" />
          </span>
          <span>Global Expert Fellowship</span>
        </a>
        <nav aria-label="Page sections">
          <a href="#room">The room</a>
          <a href="#fit">Fit</a>
          <a href="#path">Path</a>
          <a href="#apply">Apply</a>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroImage} aria-hidden="true">
          <img src="/images/014.jpg" alt="" />
        </div>
        <div className={styles.heroMarquee} aria-hidden="true">
          <div className={styles.marqueeTrack} ref={marqueeTrackRef}>
            {[...marqueeWords, ...marqueeWords].map((word, index) => (
              <span key={`${word}-${index}`}>{word}</span>
            ))}
          </div>
        </div>
        <div className={styles.heroContent}>
          <p className={styles.kicker}>Global Expert Fellowship</p>
          <h1 id="hero-title">Bring your research or startup to SF for a season.</h1>
          <div className={styles.heroBottom}>
            <p>
              If you are outside the US and want your work closer to SF&apos;s people, pace,
              and collaborators, the Global Expert Fellowship is for you.
            </p>
            <a className={styles.primaryAction} href="#apply">
              <span>Start with the interest form</span>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M5 12h13m-5-5 5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </a>
          </div>
        </div>
      </section>

      <section className={styles.manifesto} id="room" aria-labelledby="room-title">
        <div className={styles.manifestoLedger}>
          <p className={styles.ledgerLabel}>Room notes</p>
          <p>Peers who move quickly and take ideas seriously.</p>
          <p>Potential collaborators across research, startups, policy, and community building.</p>
          <p>Member dinners, reading groups, talks, coworking days, and time to work.</p>
        </div>
        <div className={styles.manifestoCopy}>
          <p className={styles.kicker}>What this is</p>
          <h2 id="room-title">Mox is a research-focused incubator and community space.</h2>
          <p>
            We gather AI safety researchers, policy experts, founders, writers, builders, and
            community organizers in San Francisco. The Global Expert Fellowship helps people
            from outside the US spend focused time at Mox, where ideas can move quickly from
            conversation to collaborators, venues, demos, and next steps.
          </p>
        </div>
      </section>

      <section className={styles.focusStrip} aria-label="Program highlights">
        <article>
          <span>01</span>
          <h3>Your own work</h3>
          <p>Research, build a company, incubate a project, or collaborate with organizations around Mox.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Time at Mox</h3>
          <p>Fellows work from Mox at least three days in a typical week.</p>
        </article>
        <article>
          <span>03</span>
          <h3>Program support</h3>
          <p>Mox supports and supervises your fellowship as your host organization and incubator.</p>
        </article>
      </section>

      <section className={styles.photoRail} aria-label="Mox photos">
        <figure>
          <img src="/images/023.jpg" alt="People gathered around a whiteboard at Mox" />
          <figcaption>Events and talks</figcaption>
        </figure>
        <figure>
          <img src="/images/003.jpg" alt="A Mox coworking space" />
          <figcaption>Workspace in SF</figcaption>
        </figure>
        <figure>
          <img src="/images/021.jpg" alt="A room inside Mox" />
          <figcaption>Places to settle in</figcaption>
        </figure>
      </section>

      <section className={styles.fit} id="fit" aria-labelledby="fit-title">
        <div className={styles.fitTitle}>
          <p className={styles.kicker}>Good fit</p>
          <h2 id="fit-title">Researchers and founders with a clear project for their time in SF.</h2>
        </div>
        <div className={styles.fitBoard}>
          <article>
            <h3>Relevant focus areas</h3>
            <p>
              Machine learning research, AI governance, biotech, biosecurity, entrepreneurship,
              fieldbuilding, animal welfare, and nearby frontier areas.
            </p>
          </article>
          <article>
            <h3>Many kinds of proof count</h3>
            <p>
              Share your side projects, prototypes, communities, papers, products, grants,
              public writing, or unusually useful things you have made.
            </p>
          </article>
          <article>
            <h3>A concrete plan</h3>
            <p>
              Bring a six-month or year-long research, startup, or incubation plan that makes
              sense specifically at Mox.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.path} id="path" aria-labelledby="path-title">
        <div className={styles.pathIntro}>
          <p className={styles.kicker}>How to apply</p>
          <h2 id="path-title">Start with a short interest form.</h2>
        </div>
        <ol className={styles.pathSteps}>
          <li>
            <span className={styles.time}>5 min</span>
            <h3>Interest form</h3>
            <p>Tell us about your background, proudest work, and what you want to build or research here.</p>
          </li>
          <li>
            <span className={styles.time}>15 min</span>
            <h3>Conversation</h3>
            <p>A short conversation about your plans, your context, and what time at Mox would help with.</p>
          </li>
          <li>
            <span className={styles.time}>1 hr</span>
            <h3>Full application</h3>
            <p>If the fit is promising, we ask for the complete program proposal.</p>
          </li>
          <li>
            <span className={styles.time}>1.5 hr</span>
            <h3>Visa setup</h3>
            <p>After acceptance, we help you move through the required visa sponsor and documentation steps.</p>
          </li>
          <li>
            <span className={styles.time}>~1 week</span>
            <h3>Sponsor review</h3>
            <p>The sponsor reviews your materials, then you schedule the consulate appointment for your visa.</p>
          </li>
          <li>
            <span className={styles.time}>~1-2 weeks</span>
            <h3>Arrive in SF</h3>
            <p>Once everything is approved, you come to San Francisco and begin your fellowship at Mox.</p>
          </li>
        </ol>
      </section>

      <section className={styles.darkRoom} aria-labelledby="requirements-title">
        <div className={styles.darkCopy}>
          <p className={styles.kicker}>Practical basics</p>
          <h2 id="requirements-title">A few things to know up front.</h2>
          <p>
            The fellowship works best for people with specialized knowledge, a clear program
            of work, and enough flexibility to spend real time with the Mox community.
          </p>
        </div>
        <div className={styles.requirementList}>
          <p><strong>Expertise:</strong> specialized knowledge or skill relevant to Mox.</p>
          <p><strong>Presence:</strong> collaborate in person at Mox three or more days most weeks.</p>
          <p><strong>Progress:</strong> attend twice-monthly supervisor check-ins.</p>
          <p><strong>Costs:</strong> plan for your US living costs, sponsor fees, and Mox resident-tier membership.</p>
          <p><strong>Documents:</strong> prepare the financial, education, and activity-plan materials the process requires.</p>
        </div>
      </section>

      <section className={styles.timeline} aria-labelledby="timeline-title">
        <div className={styles.timelineTicket}>
          <span>Rolling</span>
          <strong>No deadline</strong>
          <small>Qualified candidates can sometimes move quickly.</small>
        </div>
        <div className={styles.timelineCopy}>
          <p className={styles.kicker}>Timing</p>
          <h2 id="timeline-title">Applications are rolling.</h2>
          <p>
            We accept applications on a rolling basis. For qualified candidates with documents
            ready, processing can sometimes take around one to two weeks, depending on country,
            situation, and sponsor review.
          </p>
          <p>
            Helpful things to gather early: bank documentation, translated diploma or transcripts,
            and a clear weekly activity plan for your time at Mox.
          </p>
        </div>
      </section>

      <section className={styles.cabinet} aria-labelledby="cabinet-title">
        <p className={styles.kicker}>Life at Mox</p>
        <h2 id="cabinet-title">A regular week can include a lot.</h2>
        <div className={styles.cabinetGrid}>
          <article><span>Morning</span><p>Settle in at your desk, write, code, read, or prepare for a collaborator meeting.</p></article>
          <article><span>Lunch</span><p>Meet researchers, founders, and organizers working across AI safety and frontier technology.</p></article>
          <article><span>Afternoon</span><p>Use meeting rooms, call booths, office hours, and the ordinary helpfulness of people nearby.</p></article>
          <article><span>Evening</span><p>Join member dinners, talks, reading groups, hackathons, demo days, or a quiet walk through SF.</p></article>
        </div>
      </section>

      <section className={styles.apply} id="apply" aria-labelledby="apply-title">
        <div className={styles.applyCopy}>
          <p className={styles.kicker}>Pilot program</p>
          <h2 id="apply-title">Tell us what you want to work on.</h2>
          <p>
            Start with a short note. If there is a good fit, we will invite you to a conversation
            before asking for the full application.
          </p>
        </div>
        <form className={styles.interestForm} aria-label="Global Expert Fellowship interest form" onSubmit={onSubmit}>
          <div className={`${styles.formRow} ${styles.formRowTwo}`}>
            <label>
              <span>Name</span>
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
          </div>
          <div className={`${styles.formRow} ${styles.formRowTwo}`}>
            <label>
              <span>Current country</span>
              <input name="country" autoComplete="country-name" required />
            </label>
            <label>
              <span>Primary focus area</span>
              <input name="focus" placeholder="AI safety, biotech, fieldbuilding..." required />
            </label>
          </div>
          <label>
            <span>Background</span>
            <textarea
              name="background"
              rows={4}
              placeholder="Education, work, side projects, achievements, and anything else that helps us understand your fit."
              required
            />
          </label>
          <label>
            <span>Work you are proud of</span>
            <textarea
              name="proud"
              rows={3}
              placeholder="A project, paper, prototype, company, community, or other thing you made."
              required
            />
          </label>
          <label>
            <span>What would you work on in SF?</span>
            <textarea
              name="intentions"
              rows={4}
              placeholder="Tell us the research, startup, or project you would want to move forward during the fellowship."
              required
            />
          </label>
          <div className={styles.formFooter}>
            <p>Five minutes is enough. If there is a fit, the next step is a short conversation.</p>
            <button type="submit" disabled={submitting || submitted}>
              {submitting ? 'Sending...' : submitted ? 'Interest sent' : 'Submit interest'}
            </button>
          </div>
          <p className={styles.formNote} role="status" aria-live="polite">
            {formMessage}
          </p>
        </form>
      </section>

      <footer className={styles.footer}>
        <span>Mox Global Expert Fellowship</span>
        <a href="https://j1visa.state.gov/early-career-stem-research-initiative/">
          State Department STEM initiative
        </a>
      </footer>
    </main>
  )
}
