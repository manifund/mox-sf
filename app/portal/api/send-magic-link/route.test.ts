import { beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'
const m = vi.hoisted(() => ({ find: vi.fn(), magic: vi.fn(), send: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: m.send } } }))
vi.mock('@/app/lib/airtable', () => ({ findRecord: m.find, Tables: { People: 'People' } }))
vi.mock('@/app/lib/magic-link', () => ({ createMagicLink: m.magic }))
let counter = 0
const request = () => new Request('https://moxsf.com/portal/api/send-magic-link', {
  method: 'POST', body: JSON.stringify({ email: `test${counter++}@example.com` }),
})
beforeEach(() => {
  vi.resetAllMocks()
  m.find.mockResolvedValue({ id: 'person', fields: { Name: 'Member', Email: 'member@example.com' } })
  m.magic.mockResolvedValue('https://moxsf.com/portal/verify?token=test')
  m.send.mockResolvedValue({ data: { id: 'email' }, error: null })
})
it('does not report success when Resend rejects delivery', async () => {
  m.send.mockResolvedValue({ data: null, error: { message: 'provider unavailable' } })
  expect((await POST(request())).status).toBe(500)
})
it('reports success after token persistence and email acceptance', async () => {
  expect((await POST(request())).status).toBe(200)
  expect(m.magic).toHaveBeenCalled()
  expect(m.send).toHaveBeenCalled()
})
it('does not send an unusable link when token persistence fails', async () => {
  m.magic.mockRejectedValue(new Error('Airtable 403'))
  expect((await POST(request())).status).toBe(500)
  expect(m.send).not.toHaveBeenCalled()
})
