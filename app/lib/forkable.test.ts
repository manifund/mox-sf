import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { removeMemberFromForkable, FORKABLE_CLUBS } from './forkable'

const config = vi.hoisted(() => ({ FORKABLE_SESSION_COOKIE: '' }))
vi.mock('./env', () => ({ env: config }))

const fetchMock = vi.fn()
const reply = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init })
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body)

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  config.FORKABLE_SESSION_COOKIE = 'test-cookie'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  fetchMock.mockReset()
})

describe('removeMemberFromForkable', () => {
  it('does not call Forkable without a session cookie', async () => {
    config.FORKABLE_SESSION_COOKIE = ''
    const result = await removeMemberFromForkable({ email: 'a@example.com' })
    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('removes from both Mox clubs by default, and never from a program club', async () => {
    fetchMock.mockResolvedValue(
      reply({ data: { removeMemberFromClubs: { errors: null } } })
    )
    const result = await removeMemberFromForkable({ email: 'a@example.com' })
    expect(result).toEqual({ success: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://forkable.com/api/v2/graphql')
    expect(init.headers.Cookie).toBe('_easyorder_session=test-cookie')
    expect(sentBody().variables.input).toEqual({
      clubIds: [FORKABLE_CLUBS.MOX_MEMBERS, FORKABLE_CLUBS.MOX_RESIDENTS],
      email: 'a@example.com',
    })
    expect(sentBody().variables.input.clubIds).not.toContain(
      FORKABLE_CLUBS.FLF_FELLOWSHIP
    )
  })

  it('honours an explicit club list', async () => {
    fetchMock.mockResolvedValue(
      reply({ data: { removeMemberFromClubs: { errors: [] } } })
    )
    await removeMemberFromForkable({
      email: 'a@example.com',
      clubIds: [FORKABLE_CLUBS.MOX_RESIDENTS],
    })
    expect(sentBody().variables.input.clubIds).toEqual([
      FORKABLE_CLUBS.MOX_RESIDENTS,
    ])
  })

  it('reports a rejected mutation (e.g. unknown field) as a failure', async () => {
    fetchMock.mockResolvedValue(
      reply({
        errors: [{ message: "Field 'removeMemberFromClubs' doesn't exist" }],
      })
    )
    const result = await removeMemberFromForkable({ email: 'a@example.com' })
    expect(result).toEqual({
      success: false,
      errors: ["Field 'removeMemberFromClubs' doesn't exist"],
      rejectedBySchema: true,
      apiHints: [],
    })
  })

  it("returns Forkable's own club/member operations when the mutation is rejected", async () => {
    const id = {
      kind: 'NON_NULL',
      name: null,
      ofType: { kind: 'SCALAR', name: 'ID' },
    }
    const input = (name: string) => ({
      kind: 'NON_NULL',
      name: null,
      ofType: { kind: 'INPUT_OBJECT', name },
    })
    fetchMock
      .mockResolvedValueOnce(reply({ errors: [{ message: 'unknown field' }] }))
      .mockResolvedValueOnce(
        reply({
          data: {
            __schema: {
              mutationType: {
                fields: [
                  {
                    name: 'addMemberToClubs',
                    args: [
                      { name: 'input', type: input('AddMemberToClubsInput') },
                    ],
                  },
                  {
                    name: 'endMembership',
                    args: [
                      { name: 'input', type: input('EndMembershipInput') },
                    ],
                  },
                  { name: 'placeOrder', args: [] },
                ],
              },
              queryType: {
                fields: [
                  { name: 'club', args: [{ name: 'id', type: id }] },
                  { name: 'restaurants', args: [] },
                ],
              },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        reply({
          data: {
            t0: {
              name: 'AddMemberToClubsInput',
              inputFields: [
                {
                  name: 'clubIds',
                  type: { kind: 'LIST', name: null, ofType: id },
                },
              ],
            },
            t1: {
              name: 'EndMembershipInput',
              inputFields: [{ name: 'membershipId', type: id }],
            },
          },
        })
      )
    const result = await removeMemberFromForkable({ email: 'a@example.com' })
    expect(result.success).toBe(false)
    expect(result.rejectedBySchema).toBe(true)
    expect(result.apiHints).toEqual([
      'mutation addMemberToClubs(input: AddMemberToClubsInput!) { clubIds: [ID!] }',
      'mutation endMembership(input: EndMembershipInput!) { membershipId: ID! }',
      'query club(id: ID!)',
    ])
    // The schema questions carry no member data.
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[1].body).not.toContain('a@example.com')
    }
  })

  it('still reports the rejection when Forkable will not describe itself', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ errors: [{ message: 'unknown field' }] }))
      .mockRejectedValueOnce(new Error('introspection disabled'))
    const result = await removeMemberFromForkable({ email: 'a@example.com' })
    expect(result).toEqual({
      success: false,
      errors: ['unknown field'],
      rejectedBySchema: true,
      apiHints: [],
    })
  })

  it('reports mutation-level errors as a failure', async () => {
    fetchMock.mockResolvedValue(
      reply({
        data: {
          removeMemberFromClubs: {
            errors: ['Not a member'],
            errorAttributes: ['email'],
          },
        },
      })
    )
    const result = await removeMemberFromForkable({ email: 'a@example.com' })
    expect(result).toEqual({
      success: false,
      errors: ['Not a member'],
      errorAttributes: ['email'],
      refusedForMember: true,
    })
  })

  it('never reports success when Forkable returns no result', async () => {
    fetchMock.mockResolvedValue(
      reply({ data: { removeMemberFromClubs: null } })
    )
    expect(
      (await removeMemberFromForkable({ email: 'a@example.com' })).success
    ).toBe(false)
  })

  it('reports HTTP and network errors as failures', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({}, { status: 401, statusText: 'Unauthorized' })
    )
    expect(await removeMemberFromForkable({ email: 'a@example.com' })).toEqual({
      success: false,
      errors: ['HTTP 401: Unauthorized'],
    })
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'))
    expect(await removeMemberFromForkable({ email: 'a@example.com' })).toEqual({
      success: false,
      errors: ['socket hang up'],
    })
  })
})
