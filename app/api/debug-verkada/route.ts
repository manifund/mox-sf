// TEMPORARY diagnostic for the guest-pass "Unable to set start date" 500.
// Creates throwaway Verkada users, tries variations, deletes them. Remove
// before merging.
import { env } from '@/app/lib/env'
import { getAdminToken, verkadaFetch } from '@/app/lib/verkada'

export const maxDuration = 60
const KEY = '8a7ada0e434303aabe8049bb03520d96'

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('k') !== KEY) {
    return Response.json({ error: 'no' }, { status: 404 })
  }
  const token = await getAdminToken()
  if (!token) return Response.json({ error: 'no token' })
  const log: unknown[] = []
  const call = async (label: string, path: string, init: RequestInit = {}) => {
    const res = await verkadaFetch(token, path, init)
    const text = await res.text().catch(() => '')
    log.push({ label, status: res.status, body: text.slice(0, 600) })
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
  const put = (label: string, path: string, body: unknown) =>
    call(label, path, { method: 'PUT', body: JSON.stringify(body) })

  const tpl = await call(
    'template user',
    `/access/v1/access_users/user?user_id=${encodeURIComponent(env.VERKADA_UUID.trim())}`
  )
  const groups: string[] = (tpl?.access_groups || []).map(
    (g: { group_id: string }) => g.group_id
  )
  const other = url.searchParams.get('other')
  if (other) {
    await call('other user', `/access/v1/access_users/user?user_id=${encodeURIComponent(other)}`)
  }

  const tomorrow8 = Math.floor(Date.parse('2026-11-21T16:00:00Z') / 1000)
  const tomorrow23 = Math.floor(Date.parse('2026-11-22T07:00:00Z') / 1000)
  const now = Math.floor(Date.now() / 1000)

  const variants: Record<string, (q: string) => Promise<void>> = {
    exact: async (q) => {
      for (const g of groups)
        await put('group', `/access/v1/access_groups/group/user?group_id=${g}`, { user_id: q.split('=')[1] })
      await put('start', `/access/v1/access_users/user/start_date?${q}`, { start_date: String(tomorrow8) })
      await put('end', `/access/v1/access_users/user/end_date?${q}`, { end_date: String(tomorrow23) })
    },
    noGroups: async (q) => {
      await put('start', `/access/v1/access_users/user/start_date?${q}`, { start_date: String(tomorrow8) })
    },
    endFirst: async (q) => {
      for (const g of groups)
        await put('group', `/access/v1/access_groups/group/user?group_id=${g}`, { user_id: q.split('=')[1] })
      await put('end', `/access/v1/access_users/user/end_date?${q}`, { end_date: String(tomorrow23) })
      await put('start', `/access/v1/access_users/user/start_date?${q}`, { start_date: String(tomorrow8) })
    },
    startNow: async (q) => {
      await put('start', `/access/v1/access_users/user/start_date?${q}`, { start_date: String(now + 60) })
    },
    startNumber: async (q) => {
      await put('start', `/access/v1/access_users/user/start_date?${q}`, { start_date: tomorrow8 })
    },
  }
  const only = url.searchParams.get('v')
  for (const [name, run] of Object.entries(variants)) {
    if (only && only !== name) continue
    log.push({ variant: name })
    const created = await call('create', '/core/v1/user', {
      method: 'POST',
      body: JSON.stringify({
        first_name: 'Debug',
        last_name: `(diag ${name})`,
        external_id: `diag-${name}-${Date.now()}`,
      }),
    })
    const userId = created?.user_id
    if (!userId) continue
    try {
      await run(`user_id=${userId}`)
      await call('read back', `/access/v1/access_users/user?user_id=${userId}`)
    } finally {
      await call('delete', `/core/v1/user?user_id=${userId}`, { method: 'DELETE' })
    }
  }
  return Response.json({ groups, log })
}
