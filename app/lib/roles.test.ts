import { describe, expect, it } from 'vitest'
import {
  diffRoles,
  htmlToText,
  normalizeTitle,
  type TrackedRole,
} from './roles'

function scraped(title: string) {
  return { title, url: null, location: null, tags: [] }
}

function tracked(
  title: string,
  status = 'Open',
  source = 'Careers page'
): TrackedRole {
  return { id: `rec-${title}`, title, status, source }
}

describe('normalizeTitle', () => {
  it('ignores case, punctuation, and extra whitespace', () => {
    expect(normalizeTitle('Sr. Research  Engineer ')).toBe(
      normalizeTitle('sr research engineer')
    )
    expect(normalizeTitle('ML Engineer (Infra)')).toBe('ml engineer infra')
  })
})

describe('diffRoles', () => {
  it('creates roles not yet tracked', () => {
    const diff = diffRoles([scraped('Research Engineer')], [])
    expect(diff.toCreate.map((r) => r.title)).toEqual(['Research Engineer'])
    expect(diff.toVerify).toEqual([])
    expect(diff.toMarkStale).toEqual([])
  })

  it('verifies tracked roles still on the page, matching loosely on title', () => {
    const existing = tracked('Sr. Research Engineer')
    const diff = diffRoles([scraped('Sr Research Engineer')], [existing])
    expect(diff.toCreate).toEqual([])
    expect(diff.toVerify).toEqual([existing])
    expect(diff.toMarkStale).toEqual([])
  })

  it('marks scraper-sourced open roles stale when they vanish', () => {
    const gone = tracked('Ops Lead')
    const diff = diffRoles([], [gone])
    expect(diff.toMarkStale).toEqual([gone])
  })

  it('never marks manual or non-open roles stale', () => {
    const manual = tracked('Ops Lead', 'Open', 'Manual')
    const filled = tracked('Designer', 'Filled', 'Careers page')
    const diff = diffRoles([], [manual, filled])
    expect(diff.toMarkStale).toEqual([])
  })

  it('dedupes scraped roles listed multiple times', () => {
    const diff = diffRoles(
      [scraped('Research Engineer'), scraped('research engineer')],
      []
    )
    expect(diff.toCreate).toHaveLength(1)
  })

  it('handles a mixed page update in one pass', () => {
    const staying = tracked('Research Engineer')
    const leaving = tracked('Ops Lead')
    const diff = diffRoles(
      [scraped('Research Engineer'), scraped('Policy Analyst')],
      [staying, leaving]
    )
    expect(diff.toCreate.map((r) => r.title)).toEqual(['Policy Analyst'])
    expect(diff.toVerify).toEqual([staying])
    expect(diff.toMarkStale).toEqual([leaving])
  })
})

describe('htmlToText', () => {
  it('strips markup but keeps link targets', () => {
    const text = htmlToText(
      '<html><head><style>a{color:red}</style></head><body><script>var x=1</script><a href="/jobs/123">Research&amp;Ops Engineer</a></body></html>'
    )
    expect(text).toBe('[href:/jobs/123] Research&Ops Engineer')
  })

  it('caps output length', () => {
    expect(htmlToText(`<p>${'x'.repeat(50000)}</p>`).length).toBe(40000)
  })
})
