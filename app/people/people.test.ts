import { describe, it, expect } from 'vitest'
import { buildDirectoryData, Person, Org, Program } from './people'

function person(overrides: Partial<Person> & { id: string; name: string }): Person {
  return {
    tier: null,
    org: [],
    program: [],
    website: '',
    photo: [],
    workThing: null,
    workThingUrl: null,
    funThing: null,
    funThingUrl: null,
    ...overrides,
  }
}

function org(overrides: Partial<Org> & { id: string; name: string }): Org {
  return { stealth: false, rooms: [], active: true, ...overrides }
}

const sectionByTitle = (
  data: ReturnType<typeof buildDirectoryData>,
  title: string
) => data.sections.find((s) => s.title === title)!

const officeGroupNames = (data: ReturnType<typeof buildDirectoryData>) =>
  sectionByTitle(data, 'Offices').groups!.map((g) => g.name)

const officePeople = (data: ReturnType<typeof buildDirectoryData>, orgName: string) =>
  sectionByTitle(data, 'Offices')
    .groups!.find((g) => g.name === orgName)!
    .people.map((p) => p.name)

const memberNames = (data: ReturnType<typeof buildDirectoryData>) =>
  sectionByTitle(data, 'Members').people!.map((p) => p.name)

describe('buildDirectoryData', () => {
  const gutenberg = org({ id: 'orgG', name: 'Gutenberg', rooms: ['201'] })
  const orgsMap = new Map([[gutenberg.id, gutenberg]])
  const programsMap = new Map<string, Program>()

  it('groups Private Office tier people under their org', () => {
    const people = [
      person({ id: 'p1', name: 'Ryan Conti', tier: 'Private Office', org: ['orgG'] }),
    ]
    const data = buildDirectoryData(people, orgsMap, programsMap)
    expect(officeGroupNames(data)).toEqual(['Gutenberg'])
    expect(officePeople(data, 'Gutenberg')).toEqual(['Ryan Conti'])
  })

  it("shows office-org people under their office even when their tier isn't Private Office", () => {
    const people = [
      person({ id: 'p1', name: 'Ryan Conti', tier: 'Private Office', org: ['orgG'] }),
      person({ id: 'p2', name: 'Mathieu Roy', tier: 'Core', org: ['orgG'] }),
    ]
    const data = buildDirectoryData(people, orgsMap, programsMap)
    expect(officePeople(data, 'Gutenberg')).toContain('Mathieu Roy')
    expect(memberNames(data)).not.toContain('Mathieu Roy')
  })

  it('keeps people of inactive or room-less orgs in the Members section', () => {
    const left = org({ id: 'orgL', name: 'Leftco', rooms: ['202'], active: false })
    const noRooms = org({ id: 'orgN', name: 'Roomless' })
    const orgs = new Map([
      ['orgL', left],
      ['orgN', noRooms],
    ])
    const people = [
      person({ id: 'p1', name: 'Lena Left', tier: 'Core', org: ['orgL'] }),
      person({ id: 'p2', name: 'Nora Nomad', tier: 'Core', org: ['orgN'] }),
    ]
    const data = buildDirectoryData(people, orgs, programsMap)
    expect(sectionByTitle(data, 'Offices').groups).toHaveLength(0)
    expect(memberNames(data)).toEqual(['Lena Left', 'Nora Nomad'])
  })

  it('hides Private Office people of stealth orgs, but leaves other tiers in Members', () => {
    const stealth = org({ id: 'orgS', name: 'Sneaky', rooms: ['203'], stealth: true })
    const orgs = new Map([['orgS', stealth]])
    const people = [
      person({ id: 'p1', name: 'Petra Office', tier: 'Private Office', org: ['orgS'] }),
      person({ id: 'p2', name: 'Casey Core', tier: 'Core', org: ['orgS'] }),
    ]
    const data = buildDirectoryData(people, orgs, programsMap)
    expect(sectionByTitle(data, 'Offices').groups).toHaveLength(0)
    expect(memberNames(data)).toEqual(['Casey Core'])
  })

  it('puts Private Office people without an org under Independent', () => {
    const people = [
      person({ id: 'p1', name: 'Ida Indie', tier: 'Private Office' }),
    ]
    const data = buildDirectoryData(people, new Map(), programsMap)
    expect(officeGroupNames(data)).toEqual(['Independent'])
  })

  it('office grouping wins over program grouping', () => {
    const programs = new Map<string, Program>([
      ['prog1', { id: 'prog1', name: 'Surplus', rooms: [] }],
    ])
    const people = [
      person({ id: 'p1', name: 'Pat Both', tier: 'Core', org: ['orgG'], program: ['prog1'] }),
      person({ id: 'p2', name: 'Sam Program', tier: 'Program', program: ['prog1'] }),
    ]
    const data = buildDirectoryData(people, orgsMap, programs)
    expect(officePeople(data, 'Gutenberg')).toEqual(['Pat Both'])
    const programGroups = sectionByTitle(data, 'Programs').groups!
    expect(programGroups.map((g) => g.name)).toEqual(['Surplus'])
    expect(programGroups[0].people.map((p) => p.name)).toEqual(['Sam Program'])
  })
})
