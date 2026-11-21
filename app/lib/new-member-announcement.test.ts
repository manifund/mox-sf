import { describe, expect, it } from 'vitest'
import { cleanUrl, formatNewMemberMessage } from './new-member-announcement'

describe('formatNewMemberMessage', () => {
  it('adds the homepage "is into" line with links', () => {
    expect(
      formatNewMemberMessage({
        Name: 'Jay Luxeed',
        'Work thing': 'make number go up',
        'Work thing URL': 'example.com/numbers',
        'Fun thing': 'surprising people',
      })
    ).toBe(
      '**Jay Luxeed just started their Mox membership 🎉**\n' +
        'Jay is into [make number go up](<https://example.com/numbers>) and surprising people'
    )
  })

  it('handles just one interest', () => {
    expect(
      formatNewMemberMessage({ Name: 'Talia Smiley', 'Fun thing': 'Vibecamp' })
    ).toBe('**Talia Smiley just started their Mox membership 🎉**\nTalia is into Vibecamp')
  })

  it('posts only the headline when there is nothing to add', () => {
    expect(formatNewMemberMessage({ Name: 'Keshav Shenoy' })).toBe(
      '**Keshav Shenoy just started their Mox membership 🎉**'
    )
  })

  it('escapes markdown in member-written text', () => {
    expect(
      formatNewMemberMessage({ Name: 'A B', 'Work thing': '**bold** claims' })
    ).toContain('A is into \\*\\*bold\\*\\* claims')
  })

  it('leaves hyphens alone in link labels', () => {
    expect(
      formatNewMemberMessage({
        Name: 'Carter Crouch',
        'Work thing': 'OS human-in-the-loop framework',
        'Work thing URL': 'github.com/x/y',
      })
    ).toContain('[OS human-in-the-loop framework](<https://github.com/x/y>)')
  })

  it('links the name to their website', () => {
    expect(
      formatNewMemberMessage({ Name: 'Jay Luxeed', Website: 'jay.dev' })
    ).toBe('**[Jay Luxeed](<https://jay.dev/>) just started their Mox membership 🎉**')
  })

  it('pulls a real link out of a sentence pasted into a URL field', () => {
    expect(
      formatNewMemberMessage({
        Name: 'Zoe Senon',
        'Fun thing': 'Weird fun odd social events!',
        'Fun thing URL':
          'https://been/ posting my Inkhaven posts and past 30-day microblog challenge here: https://zoeis.me',
      })
    ).toContain('Zoe is into [Weird fun odd social events!](<https://zoeis.me/>)')
  })

  it('skips records with no name', () => {
    expect(formatNewMemberMessage({ 'Work thing': 'x' })).toBeNull()
  })
})

describe('cleanUrl', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['http://a.org/path', 'http://a.org/path'],
    ['(https://x.io).', 'https://x.io/'],
    ['https://been/', null],
    ['not a link', null],
    ['javascript:alert(1)', null],
    ['', null],
  ])('%s -> %s', (raw, expected) => {
    expect(cleanUrl(raw)).toBe(expected)
  })
})
