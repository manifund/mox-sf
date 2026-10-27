import { getSession } from '@/app/lib/session'
import { isActiveMember } from '@/app/lib/membership'
import { getUserProfile } from '../profile'
import { redirect } from 'next/navigation'
import StudioCalendarClient from './StudioCalendarClient'
import './studio.css'

export const dynamic = 'force-dynamic'

const calendarId =
  'c_acc9eff7dc86650092fc61257917d3ae04511f0268ac5c6744008fecc8347476@group.calendar.google.com'

const calendarEmbedUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=America%2FLos_Angeles&mode=WEEK&showTitle=0&showPrint=0&showCalendars=0&showTz=0`

export default async function StudioCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const { preview } = await searchParams
  const isLocalPreview = process.env.NODE_ENV === 'development' && preview === '1'

  if (!isLocalPreview) {
    const session = await getSession()
    if (!session.isLoggedIn) redirect('/portal/login')

    const effectiveUserId = session.viewingAsUserId || session.userId
    const profile = await getUserProfile(effectiveUserId)
    const activeMember = profile
      ? isActiveMember({ status: profile.status, tier: profile.tier })
      : false

    if (!activeMember) redirect('/portal')
  }

  return (
    <StudioCalendarClient
      calendarEmbedUrl={calendarEmbedUrl}
      isLocalPreview={isLocalPreview}
    />
  )
}
