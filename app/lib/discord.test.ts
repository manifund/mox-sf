import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./env', () => ({ env: { DISCORD_BOT_TOKEN: 'test-token' } }))
import {
  findDiscordMember,
  listDiscordMembers,
  syncDiscordRole,
} from './discord'
import { DISCORD_ROLES, PROGRAM_TO_ROLE } from './discord-constants'

const iliad = PROGRAM_TO_ROLE.recn4q015cMNH5ODe
const member = (roles: string[] = []) => ({
  user: { id: '123', username: 'test_member', global_name: null },
  nick: null,
  roles,
})
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200 })

describe('Airtable tier and program role sync', () => {
  it('adds Program Member and Iliad and leaves unrelated roles intact', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const result = await syncDiscordRole(
      'test_member',
      'Program',
      'Joined',
      ['recn4q015cMNH5ODe'],
      { member: member(['manual-role']) }
    )
    expect(result.success).toBe(true)
    expect(result.rolesAdded).toEqual([DISCORD_ROLES.PROGRAM, iliad])
    expect(
      fetchMock.mock.calls.map(([url, options]) => [
        url.split('/').at(-1),
        options.method,
      ])
    ).toEqual([
      [DISCORD_ROLES.PROGRAM, 'PUT'],
      [iliad, 'PUT'],
    ])
  })
  it('makes no writes when the member already has both roles', async () => {
    const result = await syncDiscordRole(
      'test_member',
      'Program',
      'Joined',
      ['recn4q015cMNH5ODe'],
      { member: member([DISCORD_ROLES.PROGRAM, iliad]) }
    )
    expect(result.success).toBe(true)
    expect(result.rolesAdded).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('supports Guest Program tier and deduplicates multiple programs using one role', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const result = await syncDiscordRole(
      'test_member',
      'Guest Program',
      'Joined',
      ['recaIlkSkyZKHQ0s2', 'recw9GcgF3DwVsxO1'],
      { member: member() }
    )
    expect(result.programRoles).toEqual([PROGRAM_TO_ROLE.recaIlkSkyZKHQ0s2])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('does not grant roles to inactive people or manage staff roles', async () => {
    for (const [tier, status] of [
      ['Program', 'Cancelled'],
      ['Program', 'Applied'],
      ['Staff', 'Joined'],
    ]) {
      expect(
        (
          await syncDiscordRole(
            'test_member',
            tier,
            status,
            ['recn4q015cMNH5ODe'],
            { member: member() }
          )
        ).success
      ).toBe(false)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('plans additions and tier replacement without writes during a dry run', async () => {
    const result = await syncDiscordRole(
      'test_member',
      'Program',
      'Joined',
      ['recn4q015cMNH5ODe'],
      { member: member([DISCORD_ROLES.CORE, 'manual-role']), dryRun: true }
    )
    expect(result.rolesAdded).toEqual([DISCORD_ROLES.PROGRAM, iliad])
    expect(result.previousRoles).toEqual([DISCORD_ROLES.CORE])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('keeps existing roles if assigning the new role fails', async () => {
    fetchMock.mockResolvedValue(new Response('Forbidden', { status: 403 }))
    const result = await syncDiscordRole(
      'test_member',
      'Program',
      'Joined',
      ['recn4q015cMNH5ODe'],
      { member: member([DISCORD_ROLES.CORE]) }
    )
    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
  })
  it('reports tier removal failure instead of claiming success', async () => {
    fetchMock.mockResolvedValue(new Response('Forbidden', { status: 403 }))
    const result = await syncDiscordRole(
      'test_member',
      'Program',
      'Joined',
      [],
      { member: member([DISCORD_ROLES.CORE, DISCORD_ROLES.PROGRAM]) }
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('remove old Discord tier role')
  })
  it('does not grant roles for an unknown program or remove old program roles', async () => {
    const result = await syncDiscordRole(
      'test_member',
      'Program',
      'Joined',
      ['unknown-program'],
      { member: member([DISCORD_ROLES.PROGRAM, iliad]) }
    )
    expect(result.programRoles).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('normalizes a pasted handle but rejects a display-name substitution', async () => {
    expect(
      (
        await syncDiscordRole(' @Test\\_Member ', 'Program', 'Joined', [], {
          member: member([DISCORD_ROLES.PROGRAM]),
        })
      ).success
    ).toBe(true)
    const other = {
      ...member(),
      user: { id: '123', username: 'someone_else', global_name: 'test_member' },
    }
    expect(
      (
        await syncDiscordRole('test_member', 'Program', 'Joined', [], {
          member: other,
        })
      ).success
    ).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('searches beyond the first ten prefix matches and chooses only the exact username', async () => {
    fetchMock.mockResolvedValue(
      ok([
        ...Array.from({ length: 10 }, (_, i) => ({
          ...member(),
          user: { ...member().user, username: `test_member${i}` },
        })),
        member(),
      ])
    )
    expect((await findDiscordMember('test_member'))?.user.username).toBe(
      'test_member'
    )
    expect(fetchMock.mock.calls[0][0]).toContain('limit=1000')
  })
  it('paginates the member list rather than losing members after the first page', async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({
      ...member(),
      user: { ...member().user, id: String(i + 1) },
    }))
    fetchMock
      .mockResolvedValueOnce(ok(first))
      .mockResolvedValueOnce(ok([member()]))
    expect(await listDiscordMembers()).toHaveLength(1001)
    expect(fetchMock.mock.calls[1][0]).toContain('after=1000')
  })
})
