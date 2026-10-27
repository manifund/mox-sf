# Deployment

This project is deployed on **Vercel** with automated CI/CD.

## Quick Reference

```bash
# Local development
bun dev

# Build for production
bun build

# Start production server
bun start
```

## Vercel Setup

The project is configured in `.vercel/project.json`. Deployments happen automatically on push to main.

### Environment Variables

Pull environment variables from Vercel for local development:

```bash
bun add -g vercel
vercel link
vercel env pull .env.local
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `AIRTABLE_API_KEY` | Airtable personal access token |
| `AIRTABLE_BASE_ID` | Airtable base identifier |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend email API key |
| `SESSION_SECRET` | 32+ character secret for iron-session |
| `CRON_SECRET` | Secret for authenticating cron jobs |
| `VERKADA_API_KEY` | Verkada access control API key |
| `DISCORD_BOT_TOKEN` | Discord bot token (optional) |
| `DISCORD_GUILD_ID` | Discord server ID (optional) |
| `NEXT_PUBLIC_BASE_URL` | Base URL (e.g., `https://moxsf.com`) |

See [env.ts](../app/lib/env.ts) for the complete list.

## Cron Jobs

Configured in `vercel.json`:

| Path | Schedule | Description |
|------|----------|-------------|
| `/api/cron/sync-discord-roles` | `*/5 * * * *` | Sync Airtable membership tiers and program roles to Discord |
| `/api/cron/rotate-door-code` | `0 17 * * 1` (Mon 5PM UTC) | Weekly door code rotation |

Cron jobs require `Authorization: Bearer {CRON_SECRET}` header.

## GitHub Actions

Two workflows in `.github/workflows/`:

### claude-code-review.yml
- Runs on pull requests
- Automated code review using Claude

### claude.yml
- Triggers when comments mention `@claude`
- AI assistance on issues and PRs

## URL Redirects

Configured in `next.config.js`:

| Path | Destination |
|------|-------------|
| `/apply` | Airtable application form |
| `/discord` | Discord invite link |
| `/feedback` | Feedback form |
| `/submit-hack` | Hackathon submission form |

## Image Domains

Remote images are allowed from:
- `v5.airtableusercontent.com` (Airtable attachments)

## Build Output

Next.js 16 with Turbopack generates:
- Static pages (pre-rendered)
- Dynamic pages (server-rendered on demand)
- API routes
- Middleware for routing

## Deployment Checklist

1. Ensure all environment variables are set in Vercel
2. Test locally with `bun build && bun start`
3. Push to main branch
4. Vercel automatically deploys
5. Verify cron job endpoints are accessible
6. Check Stripe webhook is receiving events
