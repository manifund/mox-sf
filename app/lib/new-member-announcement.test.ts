import { describe, expect, it } from 'vitest'
import { formatNewMemberMessage } from './new-member-announcement'

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

  it('skips records with no name', () => {
    expect(formatNewMemberMessage({ 'Work thing': 'x' })).toBeNull()
  })
})
