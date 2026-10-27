import { sendEmail } from '@/app/lib/email'
import { env } from '@/app/lib/env'
import { extractJson, isClaudeConfigured } from '@/app/lib/claude'
import { getJobSeekers, getOpenRoles } from '@/app/lib/careers'
import { getOrgs } from '@/app/people/people'

/**
 * Weekly cron: match job seekers to open roles with Claude and email the
 * suggestions to STAFF. Members never receive this — Mox makes the intros by
 * hand, and job-seeking status is staff-only information.
 *
 * Query params: ?to=someone@moxsf.com overrides the recipient (testing).
 */

export const maxDuration = 300

const RECIPIENT = 'carolina@moxsf.com'

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          seeker: {
            type: 'string',
            description: 'Seeker name, exactly as given',
          },
          role: { type: 'string', description: 'Role title, exactly as given' },
          company: { type: 'string' },
          reason: {
            type: 'string',
            description: 'One sentence on why this fits',
          },
        },
        required: ['seeker', 'role', 'company', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron career-matching] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isClaudeConfigured()) {
    console.warn('[Cron career-matching] ANTHROPIC_API_KEY not set; skipping')
    return Response.json({ success: true, skipped: 'no ANTHROPIC_API_KEY' })
  }

  const url = new URL(request.url)
  const toParam = url.searchParams.get('to')
  const recipient =
    toParam && toParam.endsWith('@moxsf.com') ? toParam : RECIPIENT

  try {
    const [seekers, roles, orgsMap] = await Promise.all([
      getJobSeekers(),
      getOpenRoles(),
      getOrgs(),
    ])

    if (seekers.length === 0 || roles.length === 0) {
      console.log(
        `[Cron career-matching] Nothing to match (${seekers.length} seekers, ${roles.length} roles); skipping`
      )
      return Response.json({
        success: true,
        skipped: `${seekers.length} seekers, ${roles.length} roles`,
      })
    }

    const seekerLines = seekers.map((person) =>
      [
        `- ${person.name} (${person.jobStatus})`,
        person.workThing ? `works on: ${person.workThing}` : null,
        person.careerNotes ? `notes: ${person.careerNotes}` : null,
      ]
        .filter(Boolean)
        .join('; ')
    )
    const roleLines = roles.map((role) => {
      const company =
        (role.orgId && orgsMap.get(role.orgId)?.name) ||
        role.company ||
        'Unknown org'
      return `- ${role.title} @ ${company}${role.location ? ` (${role.location})` : ''}${role.tags.length ? ` [${role.tags.join(', ')}]` : ''}`
    })

    const result = await extractJson<{
      matches: {
        seeker: string
        role: string
        company: string
        reason: string
      }[]
    }>({
      system:
        'You help coworking-space staff spot promising job matches between members and open roles at community orgs. Only suggest genuinely plausible fits (at most 3 per seeker, fine to suggest none). Staff will make warm intros by hand.',
      prompt: `Job seekers:\n${seekerLines.join('\n')}\n\nOpen roles:\n${roleLines.join('\n')}\n\nSuggest the best matches.`,
      schema: MATCH_SCHEMA,
    })

    if (!result) {
      throw new Error('Match generation failed')
    }

    const bySeeker = new Map<string, typeof result.matches>()
    for (const match of result.matches) {
      if (!bySeeker.has(match.seeker)) bySeeker.set(match.seeker, [])
      bySeeker.get(match.seeker)!.push(match)
    }

    const textSections = [...bySeeker.entries()].map(
      ([seeker, matches]) =>
        `${seeker}:\n${matches.map((m) => `  - ${m.role} @ ${m.company} — ${m.reason}`).join('\n')}`
    )
    const text = [
      `Suggested job matches (${result.matches.length} across ${bySeeker.size} seekers).`,
      'Staff-only — make intros by hand, never forward this.',
      '',
      ...textSections,
      '',
      `Careers admin: ${env.NEXT_PUBLIC_BASE_URL}/portal/admin/careers`,
    ].join('\n')

    const htmlSections = [...bySeeker.entries()]
      .map(
        ([seeker, matches]) => `
        <h3 style="margin: 16px 0 4px;">${escapeHtml(seeker)}</h3>
        <ul style="margin: 4px 0;">
          ${matches
            .map(
              (m) =>
                `<li><strong>${escapeHtml(m.role)}</strong> @ ${escapeHtml(m.company)} — ${escapeHtml(m.reason)}</li>`
            )
            .join('')}
        </ul>`
      )
      .join('')

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 640px; margin: 0 auto;">
        <h2 style="margin-bottom: 4px;">Suggested job matches</h2>
        <p style="color: #666; margin-top: 0;">
          ${result.matches.length} suggestion(s) across ${bySeeker.size} seeker(s).
          <strong>Staff-only</strong> — these are leads for warm intros, not to forward.
        </p>
        ${htmlSections}
        <p style="margin-top: 16px;">
          <a href="${env.NEXT_PUBLIC_BASE_URL}/portal/admin/careers">Open the careers admin</a>
        </p>
      </div>`

    const sent = await sendEmail({
      to: recipient,
      from: 'Mox Careers <portal@account.moxsf.com>',
      subject: `Job matches: ${result.matches.length} suggestion(s) for ${bySeeker.size} member(s)`,
      text,
      html,
    })
    if (!sent) {
      throw new Error('Failed to send matches email')
    }

    console.log(
      `[Cron career-matching] Sent ${result.matches.length} matches to ${recipient}`
    )
    return Response.json({
      success: true,
      recipient,
      seekers: seekers.length,
      roles: roles.length,
      matches: result.matches.length,
    })
  } catch (error) {
    console.error('[Cron career-matching] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
