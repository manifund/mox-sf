'use client'
import { useState, useEffect } from 'react'
import Gallery from '@/app/gallery'
import PeopleGallery from '@/app/people-gallery'
import { csContent } from '@/app/lib/homeContent'
import styles from './cs.module.css'

export default function CSPage() {
  const [visitorCount, setVisitorCount] = useState('000042')
  const [currentDate, setCurrentDate] = useState('')

  useEffect(() => {
    // Generate pseudo-random visitor count
    const count = Math.floor(Math.random() * 900000 + 100000)
    setVisitorCount(count.toString())
    
    // Set current date
    const date = new Date()
    setCurrentDate(date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }))
  }, [])

  return (
    <div className={styles.csContainer}>
      <div className={styles.mainContent}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>Welcome to the Mox Homepage</div>
          <div className={styles.subtitle}>{csContent.tagline}</div>
          <div className={styles.lastUpdated}>
            Last Updated: {currentDate || 'Loading...'}
          </div>
        </div>

        {/* Visitor Counter */}
        <div className={styles.centered}>
          <p style={{ marginBottom: '10px' }}>
            <span className={styles.blink}>●</span> You are visitor number:{' '}
            <span className={styles.counter}>{visitorCount}</span>
          </p>
        </div>

        <hr className={styles.hr} />

        {/* Introduction */}
        <div>
          <h2 className={styles.sectionTitle}>About Mox</h2>
          <p style={{ textAlign: 'justify', lineHeight: '1.6' }}>
            Mox is a collaborative research facility located at{' '}
            <a href={csContent.location} className={styles.link}>
              {csContent.subtitle}
            </a>
            . We provide infrastructure and community support for researchers and
            entrepreneurs working on important problems.
          </p>
        </div>

        {/* Table Layout for Two Columns */}
        <table className={styles.table}>
          <tbody>
            <tr>
              <td style={{ width: '50%' }}>
                <h3 style={{ marginTop: 0, fontSize: '14pt', fontWeight: 'bold' }}>
                  {csContent.communityTitle}
                </h3>
                <ul className={styles.bulletList}>
                  {csContent.communityTags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
                <p>
                  <a href="#members" className={styles.link}>
                    {csContent.communityLink}
                  </a>
                </p>
              </td>
              <td style={{ width: '50%' }}>
                <h3 style={{ marginTop: 0, fontSize: '14pt', fontWeight: 'bold' }}>
                  {csContent.offersTitle}
                </h3>
                <p style={{ lineHeight: '1.6' }}>{csContent.offersText}</p>
                <p style={{ marginTop: '15px' }}>
                  <a href={csContent.ctaButtons.primary.href} className={styles.button}>
                    {csContent.ctaButtons.primary.text}
                  </a>
                </p>
                <p>
                  <a href={csContent.ctaButtons.secondary.href} className={styles.button}>
                    {csContent.ctaButtons.secondary.text}
                  </a>
                </p>
                <p>
                  <a href={csContent.ctaButtons.tertiary.href} className={styles.button}>
                    {csContent.ctaButtons.tertiary.text}
                  </a>
                </p>
              </td>
            </tr>
          </tbody>
        </table>

        <hr className={styles.hr} />

        {/* Events Section */}
        <div>
          <h2 className={styles.sectionTitle}>{csContent.eventsTitle}</h2>
          <p style={{ fontStyle: 'italic', marginBottom: '15px' }}>
            {csContent.eventsSubtitle}
          </p>
          <div style={{ border: '2px solid #000000', padding: '15px', background: '#f9f9f9' }}>
            <p><a href="/events" className={styles.link}>View all events →</a></p>
          </div>
        </div>

        <hr className={styles.hr} />

        {/* Members Section */}
        <div id="members">
          <h2 className={styles.sectionTitle}>{csContent.peopleTitle}</h2>
          <p style={{ fontStyle: 'italic', marginBottom: '15px' }}>
            {csContent.peopleSubtitle}
          </p>
          <PeopleGallery />
        </div>

        <hr className={styles.hr} />

        {/* Directory */}
        <div>
          <h2 className={styles.sectionTitle}>Member Directory</h2>
          <p><a href="/people" className={styles.link}>View all members →</a></p>
        </div>

        <hr className={styles.hr} />

        {/* Facility Photos */}
        <div>
          <h2 className={styles.sectionTitle}>{csContent.galleryTitle}</h2>
          <p style={{ fontStyle: 'italic', marginBottom: '15px' }}>
            {csContent.gallerySubtitle}
          </p>
          <Gallery />
        </div>

        {/* Quick Links */}
        <hr className={styles.hr} />
        <div>
          <h2 className={styles.sectionTitle}>Quick Links</h2>
          <ul className={styles.bulletList}>
            <li>
              <a href="/apply" className={styles.link}>
                Application for Membership
              </a>
            </li>
            <li>
              <a href="/day-pass" className={styles.link}>
                Day Pass Information
              </a>
            </li>
            <li>
              <a href="mailto:robin@moxsf.com" className={styles.link}>
                Contact Us
              </a>
            </li>
            <li>
              <a href="https://manifund.org" className={styles.link}>
                Manifund (Sponsor)
              </a>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.centered}>
            <p style={{ marginBottom: '10px' }}>▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬</p>
            <p>
              {csContent.footerText.includes('Manifund') ? (
                <>
                  {csContent.footerText.split('Manifund')[0]}
                  <a href="https://manifund.org" className={styles.link}>
                    Manifund
                  </a>
                </>
              ) : (
                csContent.footerText
              )}
            </p>
            <p style={{ marginTop: '10px' }}>
              For inquiries, contact:{' '}
              <a href={`mailto:${csContent.footerContact}`} className={styles.link}>
                <span className={styles.email}>{csContent.footerContact}</span>
              </a>
            </p>
            <p style={{ fontSize: '9pt', color: '#666666', marginTop: '15px' }}>
              This page best viewed with Netscape Navigator 4.0 or higher
              <br />
              Screen resolution: 800x600 or higher
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
