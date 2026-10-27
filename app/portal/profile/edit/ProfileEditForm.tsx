'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ProfileEditFormProps {
  profile: {
    name: string
    email: string
    website: string
    photo: string | null
    directoryVisible: boolean
    discordUsername?: string | null
    tier?: string | null
    status?: string | null
    workThing?: string | null
    workThingUrl?: string | null
    funThing?: string | null
    funThingUrl?: string | null
    jobStatus?: string | null
    hiring?: boolean
    linkedin?: string | null
    careerNotes?: string | null
    eventDigest?: boolean
  }
  userId: string
}

export default function ProfileEditForm({
  profile,
  userId,
}: ProfileEditFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: profile.name,
    website: profile.website,
    discordUsername: profile.discordUsername || '',
    directoryVisible: profile.directoryVisible,
    workThing: profile.workThing || '',
    workThingUrl: profile.workThingUrl || '',
    funThing: profile.funThing || '',
    funThingUrl: profile.funThingUrl || '',
    jobStatus: profile.jobStatus || '',
    hiring: profile.hiring || false,
    linkedin: profile.linkedin || '',
    careerNotes: profile.careerNotes || '',
    eventDigest: profile.eventDigest || false,
  })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [message, setMessage] = useState('')
  const [discordSyncStatus, setDiscordSyncStatus] = useState<
    'idle' | 'syncing' | 'success' | 'error'
  >('idle')
  const [discordSyncMessage, setDiscordSyncMessage] = useState('')

  // Show directory fields for members/applicants who can appear in directory
  // Not for: Guest, Guest Program, Courtesy (just visiting)
  const directoryEligibleTiers = [
    'Staff',
    'Core',
    'Resident',
    'Private Office',
    'Program',
    'Friend',
    'Volunteer',
  ]
  const applicantStatuses = [
    'Applied',
    'Evaluating',
    'Backburner',
    'To Invite',
    'Invited',
    'Waitlisted',
  ]
  const showDirectoryFields =
    (profile.tier && directoryEligibleTiers.includes(profile.tier)) ||
    (profile.status && applicantStatuses.includes(profile.status))

  useEffect(() => {
    setFormData({
      name: profile.name,
      website: profile.website,
      discordUsername: profile.discordUsername || '',
      directoryVisible: profile.directoryVisible,
      workThing: profile.workThing || '',
      workThingUrl: profile.workThingUrl || '',
      funThing: profile.funThing || '',
      funThingUrl: profile.funThingUrl || '',
      jobStatus: profile.jobStatus || '',
      hiring: profile.hiring || false,
      linkedin: profile.linkedin || '',
      careerNotes: profile.careerNotes || '',
      eventDigest: profile.eventDigest || false,
    })
    setStatus('idle')
    setMessage('')
    setPhotoFile(null)
  }, [profile])

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const value =
      e.target.type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : e.target.value
    setFormData({
      ...formData,
      [e.target.name]: value,
    })
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('userId', userId)
      formDataToSend.append('name', formData.name)
      formDataToSend.append('website', formData.website)
      formDataToSend.append('discordUsername', formData.discordUsername)
      formDataToSend.append(
        'directoryVisible',
        formData.directoryVisible.toString()
      )
      formDataToSend.append('workThing', formData.workThing)
      formDataToSend.append('workThingUrl', formData.workThingUrl)
      formDataToSend.append('funThing', formData.funThing)
      formDataToSend.append('funThingUrl', formData.funThingUrl)
      formDataToSend.append('jobStatus', formData.jobStatus)
      formDataToSend.append('hiring', formData.hiring.toString())
      formDataToSend.append('linkedin', formData.linkedin)
      formDataToSend.append('careerNotes', formData.careerNotes)
      formDataToSend.append('eventDigest', formData.eventDigest.toString())

      if (photoFile) {
        formDataToSend.append('photo', photoFile)
      }

      const response = await fetch('/portal/api/update-profile', {
        method: 'POST',
        body: formDataToSend,
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage('profile updated!')
        setTimeout(() => {
          router.refresh()
        }, 1500)
      } else {
        setStatus('error')
        setMessage(data.error || 'failed to update profile. please try again.')
      }
    } catch (error) {
      setStatus('error')
      setMessage('an error occurred. please try again.')
    }
  }

  const handleDiscordSync = async () => {
    if (!formData.discordUsername) return

    setDiscordSyncStatus('syncing')
    setDiscordSyncMessage('')

    try {
      const response = await fetch('/portal/api/sync-discord-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordUsername: formData.discordUsername,
          tier: profile.tier,
          status: profile.status,
          userId,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setDiscordSyncStatus('success')
        setDiscordSyncMessage('discord role synced!')
        setTimeout(() => {
          setDiscordSyncStatus('idle')
          setDiscordSyncMessage('')
        }, 3000)
      } else {
        setDiscordSyncStatus('error')
        setDiscordSyncMessage(data.error || 'failed to sync role')
      }
    } catch (error) {
      setDiscordSyncStatus('error')
      setDiscordSyncMessage('network error. please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Basic Info */}
      <div className="form-group">
        <label htmlFor="name">name</label>
        <input
          type="text"
          id="name"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
        />
      </div>

      <div className="form-group">
        <label htmlFor="email">email</label>
        <input type="email" id="email" value={profile.email} disabled />
        <p className="muted" style={{ marginTop: '5px' }}>
          contact staff to change your email
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="discordUsername">discord username</label>
        <div className="inline-form">
          <input
            type="text"
            id="discordUsername"
            name="discordUsername"
            value={formData.discordUsername}
            onChange={handleChange}
            placeholder="yourname"
          />
          {(profile.discordUsername || formData.discordUsername) && (
            <button
              type="button"
              onClick={handleDiscordSync}
              disabled={
                discordSyncStatus === 'syncing' || !formData.discordUsername
              }
            >
              {discordSyncStatus === 'syncing' ? 'syncing...' : 'sync roles'}
            </button>
          )}
        </div>
        {discordSyncMessage && (
          <p
            className={discordSyncStatus === 'success' ? 'success' : 'error'}
            style={{ marginTop: '5px' }}
          >
            {discordSyncMessage}
          </p>
        )}
        <p className="muted" style={{ marginTop: '5px' }}>
          your discord username (without @). find it under Settings → My
          Account. If you can't see anything, click 'sync roles'.{' '}
          <a href="/discord" target="_blank" rel="noopener noreferrer">
            link to server
          </a>
        </p>
      </div>
      {/* Directory fields - only for members/applicants who can appear in directory */}
      {showDirectoryFields && (
        <>
          <hr style={{ margin: '20px 0' }} />

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                id="directoryVisible"
                name="directoryVisible"
                checked={formData.directoryVisible}
                onChange={handleChange}
              />
              <b>
                I'd like to have my profile be shown in the{' '}
                <Link href="/people">member directory</Link>
              </b>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="website">website</label>
            <input
              type="url"
              id="website"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://yourwebsite.com"
            />
          </div>

          <div className="form-group">
            <label>profile photo</label>
            <div
              style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}
            >
              {(photoFile || profile.photo) && (
                <img
                  src={
                    photoFile ? URL.createObjectURL(photoFile) : profile.photo!
                  }
                  alt="Profile"
                  style={{
                    width: '60px',
                    height: '60px',
                    objectFit: 'cover',
                    border: '1px solid #ccc',
                  }}
                />
              )}
              <div>
                <input
                  type="file"
                  id="photo"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('photo')?.click()}
                >
                  {photoFile ? 'change file' : 'choose file'}
                </button>
                {photoFile && (
                  <span style={{ marginLeft: '10px' }}>{photoFile.name}</span>
                )}
                <p className="muted" style={{ marginTop: '5px' }}>
                  JPG, PNG, WebP, GIF, or HEIC. Max 10MB.
                </p>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="workThing">
              one professional thing you're into (1-4 words)
            </label>
            <input
              type="text"
              id="workThing"
              name="workThing"
              value={formData.workThing}
              onChange={handleChange}
              placeholder='e.g. "solving evals scaling", "microbe destruction"'
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="workThingUrl">relevant hyperlink</label>
            <input
              type="url"
              id="workThingUrl"
              name="workThingUrl"
              value={formData.workThingUrl}
              onChange={handleChange}
              placeholder="your company's website, academic paper, etc"
            />
          </div>

          <div className="form-group">
            <label htmlFor="funThing">
              one fun thing you're into (1-4 words)
            </label>
            <input
              type="text"
              id="funThing"
              name="funThing"
              value={formData.funThing}
              onChange={handleChange}
              placeholder='e.g. "horse photography", "making people laugh"'
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="funThingUrl">relevant hyperlink</label>
            <input
              type="url"
              id="funThingUrl"
              name="funThingUrl"
              value={formData.funThingUrl}
              onChange={handleChange}
              placeholder="personal website, a blogpost, some obscure wikipedia page"
            />
          </div>
        </>
      )}

      <hr style={{ margin: '20px 0' }} />

      <h3 style={{ marginBottom: 4 }}>career</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        <b>private — only Mox staff can see this.</b> it never appears in the
        directory or to other members. we use it to quietly make intros when
        there&apos;s a good fit.
      </p>

      <div className="form-group">
        <label htmlFor="jobStatus">are you looking for a job?</label>
        <select
          id="jobStatus"
          name="jobStatus"
          value={formData.jobStatus}
          onChange={handleChange}
        >
          <option value="">prefer not to say</option>
          <option value="Looking now">yes, actively looking</option>
          <option value="Open to offers">open to offers</option>
          <option value="Not looking">not looking</option>
        </select>
      </div>

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            id="hiring"
            name="hiring"
            checked={formData.hiring}
            onChange={handleChange}
          />
          <b>I&apos;m hiring</b> (or my org is)
        </label>
      </div>

      <div className="form-group">
        <label htmlFor="linkedin">linkedin</label>
        <input
          type="url"
          id="linkedin"
          name="linkedin"
          value={formData.linkedin}
          onChange={handleChange}
          placeholder="https://linkedin.com/in/you"
        />
      </div>

      <div className="form-group">
        <label htmlFor="careerNotes">anything staff should know?</label>
        <textarea
          id="careerNotes"
          name="careerNotes"
          rows={2}
          value={formData.careerNotes}
          onChange={handleChange}
          placeholder='e.g. "looking for alignment research roles", "hiring a founding engineer"'
          maxLength={1000}
        />
      </div>

      <hr style={{ margin: '20px 0' }} />

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            id="eventDigest"
            name="eventDigest"
            checked={formData.eventDigest}
            onChange={handleChange}
          />
          <b>send me a weekly email with events picked for me</b>
        </label>
        <p className="muted" style={{ marginTop: '5px' }}>
          top 3 upcoming Mox events matched to your interests. unsubscribe by
          unchecking.
        </p>
      </div>

      {message && (
        <p className={status === 'success' ? 'success' : 'error'}>{message}</p>
      )}

      <button type="submit" disabled={status === 'loading'} className="primary">
        {status === 'loading' ? 'saving...' : 'save changes'}
      </button>
    </form>
  )
}
