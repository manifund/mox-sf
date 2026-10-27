/**
 * Centralized environment variable validation and access.
 *
 * Usage:
 *   import { env } from '@/app/lib/env'
 *   const stripe = new Stripe(env.STRIPE_SECRET_KEY, { ... })
 */

// Cache for lazy-loaded values
const cache = new Map<string, string>()

// Get required env var (throws if missing), with lazy caching.
// With BUILD_WITHOUT_ENV=1 (set only in `next build` commands that run without
// the app's env vars, e.g. deploys where secrets are runtime-only), a missing
// var yields an inert placeholder instead of failing the build's page-data
// collection. Runtime never sets the flag, so real requests still throw.
function required(name: string): string {
  if (cache.has(name)) return cache.get(name)!
  const value = process.env[name]
  if (!value) {
    if (process.env.BUILD_WITHOUT_ENV === '1') return `unset-${name}`
    throw new Error(`Missing required environment variable: ${name}`)
  }
  cache.set(name, value)
  return value
}

// Get optional env var with fallback, with lazy caching
function optional(name: string, fallback: string = ''): string {
  if (cache.has(name)) return cache.get(name)!
  const value = process.env[name] || fallback
  cache.set(name, value)
  return value
}

// Public/shared environment variables (evaluated immediately, safe for client)
const NODE_ENV = process.env.NODE_ENV || 'development'
const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://moxsf.com'

// Export typed env object with lazy getters for server vars
export const env = {
  // Airtable
  get AIRTABLE_API_KEY() { return required('AIRTABLE_API_KEY') },
  get AIRTABLE_BASE_ID() { return required('AIRTABLE_BASE_ID') },

  // AI4E (separate Airtable base)
  get AI4E_API_KEY() { return optional('AI4E_API_KEY') },
  get AI4E_AIRTABLE_BASE_ID() { return optional('AI4E_AIRTABLE_BASE_ID') },

  // Anthropic
  get ANTHROPIC_API_KEY() { return optional('ANTHROPIC_API_KEY') },

  // Stripe
  get STRIPE_SECRET_KEY() { return required('STRIPE_SECRET_KEY') },
  get STRIPE_WEBHOOK_SECRET() { return required('STRIPE_WEBHOOK_SECRET') },

  // Resend (email)
  get RESEND_API_KEY() { return required('RESEND_API_KEY') },

  // Session
  get SESSION_SECRET() { return required('SESSION_SECRET') },

  // Discord (bot token is secret, other IDs are in discord-constants.ts)
  get DISCORD_BOT_TOKEN() { return optional('DISCORD_BOT_TOKEN') },
  get DISCORD_CLIENT_ID() { return optional('DISCORD_CLIENT_ID') },
  get DISCORD_CLIENT_SECRET() { return optional('DISCORD_CLIENT_SECRET') },
  get DISCORD_PUBLIC_KEY() { return optional('DISCORD_PUBLIC_KEY') },

  // Verkada
  get VERKADA_API_KEY() { return optional('VERKADA_API_KEY') },
  get VERKADA_MEMBER_KEY() { return optional('VERKADA_MEMBER_KEY') },
  get VERKADA_UUID() { return optional('VERKADA_UUID') },
  get VERKADA_WEEKLY_ACCESS_USER_ID() { return optional('VERKADA_WEEKLY_ACCESS_USER_ID') },
  get VERKADA_OLD_WEEKLY_ACCESS_USER_ID() { return optional('VERKADA_OLD_WEEKLY_ACCESS_USER_ID') },
  get VERKADA_GUEST_USER_ID() { return optional('VERKADA_GUEST_USER_ID') },

  // Cron
  get CRON_SECRET() { return optional('CRON_SECRET') },

  // Forkable
  get FORKABLE_SESSION_COOKIE() { return optional('FORKABLE_SESSION_COOKIE') },

  // Forkable Sync API
  get FORKABLE_SYNC_SECRET() { return optional('FORKABLE_SYNC_SECRET') },

  // ImgBB
  get IMGBB_API_KEY() { return optional('IMGBB_API_KEY') },

  // EAG Guest Code
  get EAG_GUEST_CODE() { return required('EAG_GUEST_CODE') },

  // Task board — the Tasks/Claims tables live in their own base ("Mox ᴛᴀꜱᴋꜱ"),
  // not the main Mox base. Same AIRTABLE_API_KEY.
  get TASKS_AIRTABLE_BASE_ID() { return optional('TASKS_AIRTABLE_BASE_ID', 'appkShwDFk3Z3Yruc') },
  // Optional dedicated token for the task-board base, when the main
  // AIRTABLE_API_KEY has no access to it. Falls back to AIRTABLE_API_KEY.
  get TASKS_AIRTABLE_API_KEY() { return optional('TASKS_AIRTABLE_API_KEY') },
  // Task board — public Google sign-in for claimers (scoped to /tasks only).
  get TASKS_GOOGLE_CLIENT_ID() { return optional('TASKS_GOOGLE_CLIENT_ID') },
  get TASKS_GOOGLE_CLIENT_SECRET() { return optional('TASKS_GOOGLE_CLIENT_SECRET') },
  // Same-day turnaround clock (hours); optional overrides.
  get TASKS_NUDGE_HOURS() { return optional('TASKS_NUDGE_HOURS', '8') },
  get TASKS_RELEASE_HOURS() { return optional('TASKS_RELEASE_HOURS', '24') },
  // Comma-separated fallback organizer emails (staff are recognized via session).
  get TASKS_ORGANIZER_EMAILS() { return optional('TASKS_ORGANIZER_EMAILS') },
  // Public base URL for the board (used in email/Discord links).
  get TASKS_BASE_URL() { return optional('TASKS_BASE_URL', 'https://tasks.moxsf.com') },

  // Google studio connection: sensitive Production-only Vercel configuration.
  get STUDIO_CALENDAR_CONNECTION() { return optional('STUDIO_CALENDAR_CONNECTION') },

  // Shared/public
  NODE_ENV,
  NEXT_PUBLIC_BASE_URL,
  isProduction: NODE_ENV === 'production',
  isDevelopment: NODE_ENV === 'development',
  isTest: NODE_ENV === 'test',
}
