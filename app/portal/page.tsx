import { getSession, isCurrentlyStaff } from '@/app/lib/session'
import { isActiveMember, canIssueGuestDayPass } from '@/app/lib/membership'
import { weeklyGuestPassAllowance } from '@/app/lib/guest-passes'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import LogoutButton from './LogoutButton'
import HostedEvents from './HostedEvents'
import VerkadaPin from './VerkadaPin'
import AdminViewAsSelector from './AdminViewAsSelector'
import MembershipStatus from './MembershipStatus'
import MyDayPasses from './MyDayPasses'
import GuestPasses from './GuestPasses'
import SubscriptionInfo from './SubscriptionInfo'
import MyRequests from './MyRequests'
import { getUserProfile } from './profile'
import { fetchUserDayPasses } from './dayPasses'
import { fetchUserRequests, requestFormUrl } from './requests'

// Disable caching - session data (view-as) must be fresh on every request
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSession()

  if (!session.isLoggedIn) {
    redirect('/portal/login')
  }

  const isStaff = await isCurrentlyStaff(session.userId)

  if (session.viewingAsUserId && !isStaff) {
    redirect('/portal/api/view-as?clear=true')
  }

  const effectiveUserId = session.viewingAsUserId || session.userId
  const profile = await getUserProfile(effectiveUserId)
  const [dayPasses, requests] = profile
    ? await Promise.all([
        fetchUserDayPasses(profile.email),
        fetchUserRequests(profile.email),
      ])
    : [[], []]

  const activeMember = profile
    ? isActiveMember({ status: profile.status, tier: profile.tier })
    : false
  const canDayPass = profile
    ? canIssueGuestDayPass({ status: profile.status, tier: profile.tier })
    : false
  const guestAllowance = profile
    ? weeklyGuestPassAllowance({ status: profile.status, tier: profile.tier })
    : 0

  if (!profile) {
    return (
      <>
        <h1>error</h1>
        <p>unable to load your profile.</p>
        <p>
          your session is valid but we couldn't fetch your profile data. please
          try <Link href="/portal/login">logging in again</Link> or contact
          support if the issue persists.
        </p>
      </>
    )
  }

  // Welcome gate: day-pass holders without a name or photo need to complete
  // their profile before continuing. Skipped for admins viewing as a user.
  const needsWelcome =
    dayPasses.length > 0 && (!profile.name.trim() || !profile.photo)
  if (needsWelcome && !session.viewingAsUserId) {
    redirect('/portal/welcome')
  }

  return (
    <>
      <Link href="/" className="back-link">
        ← back to home
      </Link>

      <h1>member portal</h1>
      <p className="muted">
        logged in as {session.name || profile.name}
        {isStaff && ' (staff)'}
      </p>

      {/* Admin banner when viewing as another user */}
      {session.viewingAsUserId && session.viewingAsName && (
        <div className="alert info">
          <strong>admin mode:</strong> viewing portal as{' '}
          <strong>{session.viewingAsName}</strong>.{' '}
          <Link href="/portal/api/view-as?clear=true">switch back</Link>
        </div>
      )}

      {/* Admin tools - collapsible section at top */}
      {isStaff && (
        <details className="admin-section">
          <summary>admin tools</summary>
          <div style={{ marginTop: '10px' }}>
            <AdminViewAsSelector />
            <p style={{ marginTop: '10px' }}>
              <Link href="/portal/admin/discord-mapping">
                → discord username mapping tool
              </Link>
            </p>
            <p style={{ marginTop: '10px' }}>
              <Link href="/portal/admin/issue-day-pass">
                → issue a day pass
              </Link>
            </p>
          </div>
        </details>
      )}

      {/* Door Access — always first for anyone who can get in */}
      {(activeMember || dayPasses.length > 0) && (
        <>
          <section>
            <h2>door access</h2>
            {activeMember ? (
              <VerkadaPin
                key={effectiveUserId}
                isViewingAs={!!session.viewingAsUserId}
                tier={profile.tier}
                isActiveMember={activeMember}
                showGuestPassHint={guestAllowance !== 0 || canDayPass}
              />
            ) : (
              <MyDayPasses passes={dayPasses} isActiveMember={activeMember} hideHeading />
            )}
          </section>
          <hr />
        </>
      )}

      {/* Membership Status */}
      <section>
        <MembershipStatus
          status={profile.status}
          firstName={profile.name.split(' ')[0]}
          stripeCustomerId={profile.stripeCustomerId}
          tier={profile.tier}
          orgId={profile.orgId}
        />
      </section>

      {/* Subscription details (if has Stripe customer) */}
      {profile.stripeCustomerId && (
        <section>
          <SubscriptionInfo key={effectiveUserId} stripeCustomerId={profile.stripeCustomerId} />
        </section>
      )}

      <hr />

      {/* Tickets & requests to the ops team */}
      <section>
        <MyRequests
          requests={requests}
          formUrl={requestFormUrl(profile.name, profile.email)}
        />
      </section>

      {/* Active members' day passes below membership info */}
      {activeMember && dayPasses.length > 0 && (
        <>
          <hr />
          <MyDayPasses passes={dayPasses} isActiveMember={activeMember} />
        </>
      )}

      {/* Guest passes — free weekly allotment by tier, paid fallback */}
      {(guestAllowance !== 0 || canDayPass) && (
        <>
          <hr />
          <section id="guest-passes">
            <h2>guest passes</h2>
            {guestAllowance !== 0 ? (
              <GuestPasses key={effectiveUserId} canBuyPass={canDayPass} />
            ) : (
              <p>
                <Link href="/portal/buy-day-pass">buy a day pass for a guest</Link>
              </p>
            )}
          </section>
        </>
      )}

      {/* Room Booking — active members only */}
      {activeMember && (
        <>
          <hr />
          <section>
            <h2>studio calendar</h2>
            <p>
              <Link href="/portal/studio">
                view studio availability and schedule
              </Link>
            </p>
          </section>
          <hr />
          <section>
            <h2>book a room</h2>
            <p>
              <Link href="/portal/book-room">
                reserve a meeting room or call booth
              </Link>
            </p>
          </section>
        </>
      )}

      <hr />

      {/* Events */}
      <section>
        <HostedEvents key={effectiveUserId} userName={profile.name} />
      </section>

      <hr />

      {/* Profile */}
      <section>
        <h2>profile</h2>
        <p>
          <Link href="/portal/profile/edit">edit your profile</Link>{' '}
          <span className="muted">
            — photo, directory listing, career &amp; job status (private),
            weekly event picks
          </span>
        </p>
      </section>

      <hr />

      <LogoutButton />
    </>
  )
}
