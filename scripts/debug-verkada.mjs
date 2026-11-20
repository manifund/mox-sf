// TEMPORARY build-time diagnostic for the guest-pass start-date 500.
// Runs only on this branch's preview build; remove before merging.
if (process.env.VERCEL_GIT_COMMIT_REF !== 'claude/project-thread-u08l5r') process.exit(0)
const API = 'https://api.verkada.com'
const key = process.env.VERKADA_MEMBER_KEY || process.env.VERKADA_API_KEY
const out = (x) => console.log('[DIAG] ' + JSON.stringify(x))
try {
  const t = await fetch(`${API}/token`, { method: 'POST', headers: { accept: 'application/json', 'x-api-key': key } })
  const { token } = await t.json()
  const call = async (label, path, init = {}) => {
    const res = await fetch(API + path, { ...init, headers: { accept: 'application/json', 'content-type': 'application/json', 'x-verkada-auth': token } })
    const text = await res.text()
    out({ label, status: res.status, body: text.slice(0, 700) })
    try { return JSON.parse(text) } catch { return null }
  }
  const put = (l, p, b) => call(l, p, { method: 'PUT', body: JSON.stringify(b) })
  const tpl = await call('template', `/access/v1/access_users/user?user_id=${process.env.VERKADA_UUID.trim()}`)
  const groups = (tpl?.access_groups || []).map((g) => g.group_id)
  await call('yesterday-guest', '/access/v1/access_users/user?user_id=e57b7879-65b3-4264-83ce-a2e13b588173')
  const s = String(Math.floor(Date.parse('2026-11-22T16:00:00Z') / 1000))
  const e = String(Math.floor(Date.parse('2026-11-23T07:00:00Z') / 1000))
  const now = String(Math.floor(Date.now() / 1000) + 120)
  const variants = {
    exact: async (id) => { for (const g of groups) await put('group', `/access/v1/access_groups/group/user?group_id=${g}`, { user_id: id }); await put('start', `/access/v1/access_users/user/start_date?user_id=${id}`, { start_date: s }); await put('end', `/access/v1/access_users/user/end_date?user_id=${id}`, { end_date: e }) },
    noGroups: async (id) => { await put('start', `/access/v1/access_users/user/start_date?user_id=${id}`, { start_date: s }) },
    endFirst: async (id) => { await put('end', `/access/v1/access_users/user/end_date?user_id=${id}`, { end_date: e }); await put('start', `/access/v1/access_users/user/start_date?user_id=${id}`, { start_date: s }) },
    startSoon: async (id) => { await put('start', `/access/v1/access_users/user/start_date?user_id=${id}`, { start_date: now }) },
    entryCodeFirst: async (id) => { await put('code', `/access/v1/access_users/user/entry_code?user_id=${id}&override=false`, { entry_code: String(700000 + Math.floor(Math.random() * 299999)) }); await put('start', `/access/v1/access_users/user/start_date?user_id=${id}`, { start_date: s }) },
    byExternalId: async (id, ext) => { await put('start', `/access/v1/access_users/user/start_date?external_id=${ext}`, { start_date: s }) },
  }
  for (const [name, run] of Object.entries(variants)) {
    out({ variant: name })
    const ext = `diag-${name}-${Date.now()}`
    const c = await call('create', '/core/v1/user', { method: 'POST', body: JSON.stringify({ first_name: 'Debug', last_name: `(diag ${name})`, external_id: ext }) })
    if (!c?.user_id) continue
    try { await run(c.user_id, ext); await call('readback', `/access/v1/access_users/user?user_id=${c.user_id}`) }
    finally { await call('delete', `/core/v1/user?user_id=${c.user_id}`, { method: 'DELETE' }) }
  }
} catch (err) { out({ error: String(err) }) }
