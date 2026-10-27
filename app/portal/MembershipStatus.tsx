'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MEMBERSHIP_TIERS, formatDollars } from '@/app/lib/membership-pricing'

export default function MembershipStatus({
  status,
  firstName,
  stripeCustomerId,
  tier,
  orgId,
}: {
  status?: string | null
  firstName: string
  stripeCustomerId: string | null
  tier?: string | null
  orgId?: string | null
}) {
  const [orgName, setOrgName] = useState<string | null>(null)
  const [loadingOrg, setLoadingOrg] = useState(false)

  useEffect(() => {
    if (tier === 'Private Office' && orgId) {
      setLoadingOrg(true)
      fetch(`/portal/api/org-details?orgId=${orgId}`)
        .then((res) => res.json())
        .then((data) => {
          setOrgName(data.name || null)
          setLoadingOrg(false)
        })
        .catch(() => {
          setLoadingOrg(false)
        })
    }
  }, [tier, orgId])

  const isInvited = status === 'Invited' || status === 'To Invite'
  const isPrivateOffice = tier === 'Private Office'

  // Translate Airtable internal statuses to softer user-facing copy.
  // Statuses not in the map are shown verbatim.
  const STATUS_BADGE: Record<string, string> = {
    active: 'confirmed',
    invited: 'paused',
    paused: 'paused',
    'payment issue': 'cancelled',
    inactive: 'cancelled',
    'guest program': 'confirmed',
    'event host': '',
  }

  const STATUS_DISPLAY: Record<string, string> = {
    Joined: 'active',
    Invited: 'invited',
    'To Invite': 'invited',
    Applied: 'application received',
    Evaluating: 'application under review',
    Waitlisted: 'waitlisted',
    'Guest Program': 'guest program',
    'Event Host': 'event host',
    Paused: 'paused',
    Cancelled: 'inactive',
    'Payment Issue': 'payment issue',
    Visited: 'inactive',
    Backburner: 'inactive',
    Rejected: 'inactive',
    Declined: 'inactive',
  }
  const isVisitor = !status
  const displayStatus = status ? STATUS_DISPLAY[status] || status : 'visitor'

  // Format tier display name
  // Tiers: Staff, Volunteer, Private Office, Program, Resident, Core, Friend, Courtesy, Guest Program, Paused
  const getTierDisplay = () => {
    if (!tier) return null
    if (tier === 'Private Office') return 'private office'
    if (tier === 'Guest Program') return 'guest program'
    return tier.toLowerCase()
  }

  return (
    <>
      <h2>membership</h2>

      <p>
        {tier && !isInvited && displayStatus !== 'inactive' && (
          <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            <span className="badge">{getTierDisplay()}</span>
            <span className={`badge ${STATUS_BADGE[displayStatus] ?? ''}`}>{displayStatus}</span>
            {isPrivateOffice && orgId && (
              <span className="muted">
                ({loadingOrg ? 'loading...' : orgName || 'no office assigned'})
              </span>
            )}
          </span>
        )}
        {(!tier || isInvited || displayStatus === 'inactive') && (
          <>
            membership status: <strong>{displayStatus}</strong>
            {isPrivateOffice && orgId && (
              <> ({loadingOrg ? 'loading...' : orgName || 'no office assigned'})</>
            )}
          </>
        )}
      </p>

      {(isVisitor || displayStatus === 'inactive') && !stripeCustomerId && (
        <p style={{ marginTop: '15px' }}>
          <Link
            href={`/join?name=${encodeURIComponent(firstName)}`}
            className="btn primary"
          >
            apply for membership
          </Link>
        </p>
      )}

      {isInvited && (
        <>
          <div className="alert info">
            <p>
              hey {firstName}! you're invited to join mox. all memberships
              include a 1-week free trial.
            </p>
          </div>

          <p style={{ marginTop: '15px' }}>
            <strong>Core</strong>{' '}
            {formatDollars(MEMBERSHIP_TIERS.core.quarterlyMonthlyCents)}/mo
            quarterly or {formatDollars(MEMBERSHIP_TIERS.core.monthlyCents)}{' '}
            month-to-month · unlimited access, hot desk
            <br />
            <strong>Resident</strong>{' '}
            {formatDollars(MEMBERSHIP_TIERS.resident.quarterlyMonthlyCents)}/mo
            quarterly or{' '}
            {formatDollars(MEMBERSHIP_TIERS.resident.monthlyCents)}{' '}
            month-to-month · dedicated desk + monitor
          </p>

          <p style={{ marginTop: '15px' }}>
            <Link
              href={`/join?name=${encodeURIComponent(firstName)}`}
              className="btn primary"
            >
              choose a membership
            </Link>
          </p>

          <p className="muted" style={{ marginTop: '15px' }}>
            questions? <a href="mailto:robin@moxsf.com">robin@moxsf.com</a>
          </p>
        </>
      )}
    </>
  )
}
