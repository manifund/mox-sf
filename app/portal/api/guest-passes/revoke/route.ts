import { getSession, isCurrentlyStaff } from '@/app/lib/session'
import { Tables, getRecord } from '@/app/lib/airtable'
import {
  parseGuestPass,
  revokeGuestPass,
  type GuestPassFields,
} from '@/app/lib/guest-passes-server'
import { GUEST_PASS_TYPE, canRevokeGuestPass } from '@/app/lib/guest-passes'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session.isLoggedIn || !session.userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { passId } = await request.json().catch(() => ({}))
    if (!passId || typeof passId !== 'string') {
      return Response.json({ error: 'passId is required' }, { status: 400 })
    }

    const record = await getRecord<GuestPassFields>(Tables.DayPasses, passId)
    if (!record || record.fields['Pass Type'] !== GUEST_PASS_TYPE) {
      return Response.json({ error: 'Pass not found' }, { status: 404 })
    }
    const pass = parseGuestPass(record)
    const hostId = session.viewingAsUserId || session.userId
    const ownsPass = pass.hostId === hostId
    if (!ownsPass && !(await isCurrentlyStaff(session.userId))) {
      return Response.json({ error: 'Not your pass' }, { status: 403 })
    }

    if (!canRevokeGuestPass(pass)) {
      return Response.json(
        { error: "this pass was already used, so it can't be revoked" },
        { status: 409 }
      )
    }

    await revokeGuestPass(pass.id)
    console.log(`[guest-passes] ${hostId} revoked pass ${pass.id}`)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[guest-passes] revoke failed:', error)
    return Response.json({ error: 'Failed to revoke pass' }, { status: 500 })
  }
}
