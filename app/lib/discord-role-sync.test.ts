import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./airtable', () => ({
  findRecords: vi.fn(),
  Tables: { People: 'People' },
}))
vi.mock('./discord', () => ({
  listDiscordMembers: vi.fn(),
  normalizeDiscordUsername: (s: string) =>
    s.trim().replace(/^@/, '').toLowerCase(),
  syncDiscordRole: vi.fn(),
}))
import { findRecords } from './airtable'
import { listDiscordMembers, syncDiscordRole } from './discord'
import { syncAirtableDiscordRoles } from './discord-role-sync'
const person = (id: string, username: string, extra = {}) => ({
  id,
  fields: {
    Name: id,
    Tier: 'Program',
    Status: 'Joined',
    Program: ['recn4q015cMNH5ODe'],
    'Discord Username': username,
    ...extra,
  },
})
const member = {
  user: { id: '123', username: 'member', global_name: null },
  nick: null,
  roles: [],
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listDiscordMembers).mockResolvedValue([member])
  vi.mocked(syncDiscordRole).mockResolvedValue({
    success: true,
    roleAssigned: 'tier',
    programRoles: ['iliad'],
    rolesAdded: ['iliad'],
  })
})
it('reads program affiliations from Airtable and reports missing usernames for retry', async () => {
  vi.mocked(findRecords).mockResolvedValue([
    person('first', 'member'),
    person('second', 'not-yet-joined'),
    person('inactive', 'inactive', { Status: 'Cancelled' }),
  ])
  const result = await syncAirtableDiscordRoles({ dryRun: true })
  expect(result).toMatchObject({
    total: 2,
    synced: 1,
    skipped: 1,
    dryRun: true,
    changed: 1,
  })
  expect(syncDiscordRole).toHaveBeenCalledWith(
    'member',
    'Program',
    'Joined',
    ['recn4q015cMNH5ODe'],
    { member, dryRun: true }
  )
  expect(vi.mocked(findRecords).mock.calls[0][2]?.fields).toContain('Program')
})
it('does not alternate roles for duplicate Airtable identities', async () => {
  vi.mocked(findRecords).mockResolvedValue([
    person('first', 'member'),
    person('second', 'MEMBER', { Tier: 'Core' }),
  ])
  const result = await syncAirtableDiscordRoles()
  expect(result.skipped).toBe(2)
  expect(syncDiscordRole).not.toHaveBeenCalled()
})
it('surfaces failures and unmapped programs', async () => {
  vi.mocked(findRecords).mockResolvedValue([
    person('first', 'member', { Program: ['unmapped'] }),
  ])
  vi.mocked(syncDiscordRole).mockResolvedValue({
    success: false,
    error: 'Forbidden',
  })
  expect(await syncAirtableDiscordRoles()).toMatchObject({
    success: false,
    failed: 1,
    unmappedProgramIds: ['unmapped'],
  })
})
