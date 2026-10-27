/**
 * Pure diff logic for the scrape-roles cron: compare roles extracted from an
 * org's careers page against the Roles records we already track for that org.
 */

export interface ScrapedRole {
  title: string
  url: string | null
  location: string | null
  tags: string[]
}

export interface TrackedRole {
  id: string
  title: string
  status: string
  source: string
}

/** Normalize titles so "Sr. Research Engineer " matches "Sr Research Engineer". */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface RoleDiff {
  /** Scraped roles with no matching tracked role — create as Open. */
  toCreate: ScrapedRole[]
  /** Tracked roles seen on the page this run — bump Last verified (and reopen if Stale). */
  toVerify: TrackedRole[]
  /** Scraper-sourced Open roles that vanished from the page — mark Stale. */
  toMarkStale: TrackedRole[]
}

export function diffRoles(
  scraped: ScrapedRole[],
  tracked: TrackedRole[]
): RoleDiff {
  // Dedupe scraped roles by normalized title (careers pages sometimes list
  // the same role per-location).
  const scrapedByTitle = new Map<string, ScrapedRole>()
  for (const role of scraped) {
    const key = normalizeTitle(role.title)
    if (key && !scrapedByTitle.has(key)) {
      scrapedByTitle.set(key, role)
    }
  }

  const trackedByTitle = new Map<string, TrackedRole>()
  for (const role of tracked) {
    const key = normalizeTitle(role.title)
    if (key && !trackedByTitle.has(key)) {
      trackedByTitle.set(key, role)
    }
  }

  const toCreate: ScrapedRole[] = []
  const toVerify: TrackedRole[] = []
  for (const [key, role] of scrapedByTitle) {
    const existing = trackedByTitle.get(key)
    if (existing) {
      toVerify.push(existing)
    } else {
      toCreate.push(role)
    }
  }

  // Only the scraper's own Open roles go Stale — staff-entered roles
  // (Manual/Member) and already-closed ones are left alone.
  const toMarkStale = tracked.filter(
    (role) =>
      role.source === 'Careers page' &&
      role.status === 'Open' &&
      !scrapedByTitle.has(normalizeTitle(role.title))
  )

  return { toCreate, toVerify, toMarkStale }
}

/** Crude HTML → text for feeding careers pages to the extractor. */
export function htmlToText(html: string, maxChars = 40000): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Keep link hrefs — job URLs usually live there.
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, ' [href:$1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, maxChars)
}
