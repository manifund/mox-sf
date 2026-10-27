import { sealData, unsealData } from 'iron-session'
import { env } from './env'

export const STUDIO_CALENDAR_ID =
  'c_acc9eff7dc86650092fc61257917d3ae04511f0268ac5c6744008fecc8347476@group.calendar.google.com'
export const STUDIO_OWNER_EMAIL = 'carolina@moxsf.com'
export const STUDIO_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
type Connection = { email: string; refreshToken: string }

// Owner downloads this sealed value after consent. An administrator installs
// it as sensitive Production configuration in Vercel. No calendar database.
export async function sealStudioConnection(connection: Connection) {
  if (connection.email !== STUDIO_OWNER_EMAIL || !connection.refreshToken)
    throw new Error('Invalid calendar owner')
  return sealData(connection, { password: env.SESSION_SECRET, ttl: 0 })
}

export async function getStudioAccessToken() {
  if (!env.STUDIO_CALENDAR_CONNECTION)
    throw new Error('Studio calendar is not connected')
  const connection = await unsealData<Connection>(
    env.STUDIO_CALENDAR_CONNECTION,
    { password: env.SESSION_SECRET, ttl: 0 }
  )
  if (connection.email !== STUDIO_OWNER_EMAIL || !connection.refreshToken)
    throw new Error('Reconnect the studio calendar')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.TASKS_GOOGLE_CLIENT_ID,
      client_secret: env.TASKS_GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Reconnect the studio calendar')
  const token = (await response.json()) as { access_token?: string }
  if (!token.access_token)
    throw new Error('Could not connect to Google Calendar')
  return token.access_token
}
