import {
  createRecords,
  findRecords,
  updateRecord,
  Tables,
} from '@/app/lib/airtable'
import { extractJson, isClaudeConfigured } from '@/app/lib/claude'
import { diffRoles, htmlToText, type ScrapedRole } from '@/app/lib/roles'
import { ptDateString } from '@/app/lib/checkins'
import type { RoleFields } from '@/app/lib/careers'
import { env } from '@/app/lib/env'

/**
 * Weekly cron: fetch each org's Careers URL, extract current openings with
 * Claude, and sync them into the Roles table — new roles created as Open,
 * still-listed roles get Last verified bumped, vanished scraper-sourced
 * roles are marked Stale.
 *
 * Query params (for manual runs):
 *   ?org=recXXX  only scrape one org
 *   ?dry=1       extract + diff but don't write to Airtable
 */

export const maxDuration = 300

const ROLE_TAGS = [
  'AI Safety',
  'Research',
  'Engineering',
  'Policy',
  'Operations',
  'Comms',
  'Design',
  'Other',
]

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          tags: { type: 'array', items: { type: 'string', enum: ROLE_TAGS } },
        },
        required: ['title', 'url', 'location', 'tags'],
        additionalProperties: false,
      },
    },
  },
  required: ['roles'],
  additionalProperties: false,
}

interface OrgFields {
  Name?: string
  'Careers URL'?: string
  Website?: string
  About?: string
}

// How many new roles per org get a follow-up fetch of their own posting page
// for description/salary/deadline (bounds runtime and LLM spend).
const MAX_DETAIL_FETCHES_PER_ORG = 8

const DETAIL_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: ['string', 'null'],
      description:
        'Short summary: one intro sentence, then at most 4 lines starting with "- " covering the most important responsibilities, requirements, and schedule/type. Keep each line under 15 words. Null if the page has no real detail.',
    },
    salary: {
      type: ['string', 'null'],
      description:
        'Salary/compensation as listed, e.g. "$120k-$160k". Null if not listed.',
    },
    deadline: {
      type: ['string', 'null'],
      description: 'Application deadline as YYYY-MM-DD. Null if not listed.',
    },
  },
  required: ['description', 'salary', 'deadline'],
  additionalProperties: false,
}

const ABOUT_SCHEMA = {
  type: 'object',
  properties: {
    about: {
      type: ['string', 'null'],
      description:
        'One or two neutral sentences describing what the organization does, suitable for a public job board. Null if the page gives too little to go on.',
    },
  },
  required: ['about'],
  additionalProperties: false,
}

interface RoleDetail {
  description: string | null
  salary: string | null
  deadline: string | null
}

/** Fetch a role's own posting page and extract description/salary/deadline. */
async function fetchRoleDetail(
  orgName: string,
  title: string,
  roleUrl: string
): Promise<RoleDetail | null> {
  const html = await fetchCareersPage(roleUrl)
  if (!html) return null
  return extractJson<RoleDetail>({
    system:
      'You summarize a single job posting for a community job board. Be factual and concise; never invent salary, deadline, or requirements that are not on the page.',
    prompt: `Job posting: "${title}" at ${orgName} (${roleUrl}).\n\nPage text:\n\n${htmlToText(html, 25000)}`,
    schema: DETAIL_SCHEMA,
    maxTokens: 2000,
  })
}

/** Generate a 1-2 sentence public blurb for an org from its website. */
async function generateOrgAbout(
  orgName: string,
  website: string
): Promise<string | null> {
  const html = await fetchCareersPage(website)
  if (!html) return null
  const result = await extractJson<{ about: string | null }>({
    system:
      'You write one- to two-sentence neutral descriptions of organizations for a public job board, based only on their own website text.',
    prompt: `Website of ${orgName} (${website}):\n\n${htmlToText(html, 15000)}\n\nWrite the blurb.`,
    schema: ABOUT_SCHEMA,
    maxTokens: 1000,
  })
  return result?.about ?? null
}

async function fetchCareersPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'MoxJobsBot/1.0 (+https://moxsf.com/jobs)' },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    })
    if (!res.ok) {
      console.error(`[Cron scrape-roles] ${url} returned ${res.status}`)
      return null
    }
    return await res.text()
  } catch (error) {
    console.error(`[Cron scrape-roles] Failed to fetch ${url}:`, error)
    return null
  }
}

async function extractRoles(
  orgName: string,
  pageUrl: string,
  pageText: string
): Promise<ScrapedRole[] | null> {
  const result = await extractJson<{ roles: ScrapedRole[] }>({
    system:
      'You extract job openings from careers-page text. Only include real, currently-open individual roles (not "general applications" or newsletter prompts). Resolve relative hrefs against the page URL; if a role has no link, use null.',
    prompt: `Careers page for ${orgName} (${pageUrl}). Extract the open roles.\n\nPage text (links appear as [href:...]):\n\n${pageText}`,
    schema: EXTRACTION_SCHEMA,
  })
  return result?.roles ?? null
}

export async function GET(request: Request) {
  const startTime = Date.now()

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron scrape-roles] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isClaudeConfigured()) {
    console.warn('[Cron scrape-roles] ANTHROPIC_API_KEY not set; skipping')
    return Response.json({ success: true, skipped: 'no ANTHROPIC_API_KEY' })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry') === '1'
  const onlyOrg = url.searchParams.get('org')

  try {
    let orgs = await findRecords<OrgFields>(Tables.Orgs, `{Careers URL}!=""`, {
      fields: ['Name', 'Careers URL', 'Website', 'About'],
    })
    if (onlyOrg) {
      orgs = orgs.filter((org) => org.id === onlyOrg)
    }
    console.log(
      `[Cron scrape-roles] Scraping ${orgs.length} org careers pages...`
    )

    // One fetch for all tracked roles; filtered per org below (the Org field
    // returns linked record IDs via the API, but not in formulas).
    const allTracked = await findRecords<RoleFields>(Tables.Roles, '', {
      fields: ['Title', 'Status', 'Source', 'Org'],
    })

    const today = ptDateString(new Date())
    const results: Record<string, unknown>[] = []

    for (const org of orgs) {
      const orgName = org.fields.Name || org.id
      const careersUrl = org.fields['Careers URL']!

      const html = await fetchCareersPage(careersUrl)
      if (!html) {
        results.push({ org: orgName, error: 'fetch failed' })
        continue
      }

      const scraped = await extractRoles(orgName, careersUrl, htmlToText(html))
      if (!scraped) {
        results.push({ org: orgName, error: 'extraction failed' })
        continue
      }

      const tracked = allTracked.filter((record) =>
        record.fields.Org?.includes(org.id)
      )
      const diff = diffRoles(
        scraped,
        tracked.map((record) => ({
          id: record.id,
          title: record.fields.Title || '',
          status: record.fields.Status || '',
          source: record.fields.Source || '',
        }))
      )

      if (!dryRun) {
        if (diff.toCreate.length > 0) {
          // For new roles with their own posting page, pull richer detail
          // (description bullets, salary, deadline) for the expandable card.
          const details = new Map<string, RoleDetail>()
          const detailCandidates = diff.toCreate
            .filter((role) => role.url && role.url !== careersUrl)
            .slice(0, MAX_DETAIL_FETCHES_PER_ORG)
          for (const role of detailCandidates) {
            const detail = await fetchRoleDetail(orgName, role.title, role.url!)
            if (detail) details.set(role.title, detail)
          }

          await createRecords<RoleFields>(
            Tables.Roles,
            diff.toCreate.map((role) => {
              const detail = details.get(role.title)
              return {
                Title: role.title,
                Org: [org.id],
                URL: role.url || careersUrl,
                Location: role.location || undefined,
                Tags: role.tags,
                Status: 'Open',
                Source: 'Careers page',
                Posted: today,
                'Last verified': today,
                Description: detail?.description || undefined,
                Salary: detail?.salary || undefined,
                Deadline: detail?.deadline || undefined,
              }
            }),
            { typecast: true }
          )
        }

        // Auto-generate the org's public "About" blurb from its website the
        // first time around; never overwrite a hand-edited value.
        if (!org.fields.About && org.fields.Website) {
          const about = await generateOrgAbout(orgName, org.fields.Website)
          if (about) {
            await updateRecord<OrgFields>(Tables.Orgs, org.id, { About: about })
          }
        }
        for (const role of diff.toVerify) {
          await updateRecord<RoleFields>(Tables.Roles, role.id, {
            'Last verified': today,
            // A role that reappeared after going stale is open again.
            ...(role.status === 'Stale' && role.source === 'Careers page'
              ? { Status: 'Open' }
              : {}),
          })
        }
        for (const role of diff.toMarkStale) {
          await updateRecord<RoleFields>(Tables.Roles, role.id, {
            Status: 'Stale',
          })
        }
      }

      results.push({
        org: orgName,
        scraped: scraped.length,
        created: diff.toCreate.map((r) => r.title),
        verified: diff.toVerify.length,
        markedStale: diff.toMarkStale.map((r) => r.title),
      })
    }

    const duration = Date.now() - startTime
    console.log(`[Cron scrape-roles] Done in ${duration}ms`)
    return Response.json({
      success: true,
      dryRun,
      results,
      durationMs: duration,
    })
  } catch (error) {
    console.error('[Cron scrape-roles] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
