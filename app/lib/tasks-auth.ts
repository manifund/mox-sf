/**
 * Auth for the public task board — deliberately isolated from member auth.
 *
 * Public claimers sign in with Google, which mints a separate `mox-tasks`
 * cookie here. This never reads or writes the member `mox-session`, so the
 * portal's email/magic-link auth is completely untouched.
 *
 * Organizer powers (add/approve) are NOT Google-based: they come from the
 * member email-based staff session (requireStaff) or an explicit allowlist.
 */
import { getIronSession, IronSession, SessionOptions } from 'iron-session'
import { cookies } from 'next/headers'
import { env } from './env'
import { requireStaff } from './session'

export interface ClaimerSession {
  email: string
  name: string
  loggedIn: boolean
}

// Built lazily so importing this module never reads env (which would break
// `next build` in environments without the app's env vars).
function claimerOptions(): SessionOptions {
  return {
    password: env.SESSION_SECRET,
    cookieName: 'mox-tasks',
    cookieOptions: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  }
}

export async function getClaimerSession(): Promise<
  IronSession<ClaimerSession>
> {
  const cookieStore = await cookies()
  return getIronSession<ClaimerSession>(cookieStore, claimerOptions())
}

export interface Claimer {
  email: string
  name: string
}

/** The signed-in Google claimer, or null. */
export async function getClaimer(): Promise<Claimer | null> {
  const session = await getClaimerSession()
  if (!session.loggedIn || !session.email) return null
  return { email: session.email, name: session.name || session.email }
}

export async function createClaimerSession(
  email: string,
  name: string
): Promise<void> {
  const session = await getClaimerSession()
  session.email = email
  session.name = name
  session.loggedIn = true
  await session.save()
}

export async function destroyClaimerSession(): Promise<void> {
  const session = await getClaimerSession()
  session.destroy()
}

function organizerAllowlist(): string[] {
  return env.TASKS_ORGANIZER_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Whether the current request has organizer powers. True if the visitor is a
 * Mox staff member (email-based member session) or their claimer email is in
 * the TASKS_ORGANIZER_EMAILS allowlist.
 */
export async function isOrganizer(): Promise<boolean> {
  const staff = await requireStaff()
  if (staff) return true
  const claimer = await getClaimer()
  if (!claimer) return false
  return organizerAllowlist().includes(claimer.email.toLowerCase())
}

export interface TaskActor {
  email: string
  name: string
  isStaff: boolean
}

/**
 * Whoever is acting on the task board right now: a staff member (email-based
 * member session) takes precedence, else the Google claimer. Used to record
 * task creators and to check edit permission.
 */
export async function getTaskActor(): Promise<TaskActor | null> {
  const staff = await requireStaff()
  if (staff) {
    return {
      email: staff.email,
      name: staff.name || staff.email,
      isStaff: true,
    }
  }
  const claimer = await getClaimer()
  return claimer ? { ...claimer, isStaff: false } : null
}

/** Organizers can manage any task; creators can manage their own. */
export async function canManageTask(createdByEmail: string): Promise<boolean> {
  if (await isOrganizer()) return true
  if (!createdByEmail) return false
  const actor = await getTaskActor()
  return !!actor && actor.email.toLowerCase() === createdByEmail.toLowerCase()
}
