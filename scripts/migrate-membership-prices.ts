#!/usr/bin/env bun
// Command-line twin of /portal/api/migrate-membership-prices: the Nov 1, 2026
// membership price migration, run from a checkout with production env vars.
//
// Usage:
//   bun --env-file=.env.local scripts/migrate-membership-prices.ts            # dry run, Core/Resident only
//   bun --env-file=.env.local scripts/migrate-membership-prices.ts --friends  # dry run incl. Friend → Core
//   bun --env-file=.env.local scripts/migrate-membership-prices.ts --apply [--friends]
//   ... --out /path/to/report.txt   also writes the report to a file
//
// Needs STRIPE_SECRET_KEY, AIRTABLE_*, RESEND/email and (for --friends --apply)
// FORKABLE_* in the environment: `vercel env pull .env.local` provides them.
// Nothing changes without --apply. The report is emailed to team@ either way.
// See docs/workflows/price-migration.md.

import { writeFileSync } from 'node:fs'
import { runMigration } from '../app/lib/membership-price-migration-runner'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const friends = args.includes('--friends')
const outIndex = args.indexOf('--out')
const outPath = outIndex === -1 ? null : args[outIndex + 1]
const unknown = args.filter(
  (a, i) => !['--apply', '--friends', '--out'].includes(a) && args[i - 1] !== '--out'
)
if (unknown.length || (outIndex !== -1 && !outPath)) {
  console.error(`unknown arguments: ${unknown.join(' ')}`)
  console.error('usage: migrate-membership-prices.ts [--apply] [--friends] [--out report.txt]')
  process.exit(2)
}

const tag = `${apply ? 'APPLY' : 'DRY RUN'}${friends ? ' + Friends' : ''}`
console.log(`membership price migration — ${tag}`)

const result = await runMigration({
  apply,
  friends,
  onRow(row, index, total) {
    if (!apply || row.decision.action !== 'migrate') return
    const who = row.subscription.customerEmail ?? row.subscription.customerId
    const outcome = row.error ? `FAILED: ${row.error}` : 'OK'
    const notes = row.notes?.length ? ` [${row.notes.join('; ')}]` : ''
    console.log(`[${index + 1}/${total}] ${outcome} ${who}${notes}`)
  },
})

if (outPath) {
  writeFileSync(outPath, result.report)
  console.log(`report written to ${outPath}`)
}
console.log(`emailed team@: ${result.emailed}`)
const s = result.summary
console.log(
  `${result.rows.length} considered: ${s.migrate} to migrate (${s.tierChanges} Friend → Core)` +
    (apply ? ` — ${s.applied} applied, ${s.failed} failed` : '') +
    `, ${s.skip} skipped, ${s.manual} manual`
)
process.exit(apply && s.failed > 0 ? 1 : 0)
