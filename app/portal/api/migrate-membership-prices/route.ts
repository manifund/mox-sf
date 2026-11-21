import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/app/lib/session'
import {
  MigrationSetupError,
  runMigration,
} from '@/app/lib/membership-price-migration-runner'

export const maxDuration = 300

// Staff-only one-off: move existing month-to-month Core/Resident subscriptions
// onto the Nov 1, 2026 monthly prices. With `friends=true` it also moves
// retired Friend subscriptions onto Core monthly (which sets Airtable Tier =
// Core and adds the member to Forkable); without it Friend rows are skipped,
// so the price increase and the Friend → Core move can run on different days.
// Dry run unless `apply=true`. See docs/workflows/price-migration.md.
//
// GET  — always a dry run (safe to open in a browser); ?friends=true previews
//        the Friend pass too
// POST — dry run unless ?apply=true (or {"apply": true} in the JSON body);
//        ?friends=true / {"friends": true} includes Friend → Core
//
// The same run is available from the command line:
//   bun --env-file=.env.local scripts/migrate-membership-prices.ts [--apply] [--friends]

export async function GET(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  return run({
    apply: false,
    friends: request.nextUrl.searchParams.get('friends') === 'true',
  })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const params = request.nextUrl.searchParams
  const body = await request.json().catch(() => null)
  const apply = params.get('apply') === 'true' || body?.apply === true
  const friends = params.get('friends') === 'true' || body?.friends === true
  return run({ apply, friends })
}

async function run({ apply, friends }: { apply: boolean; friends: boolean }) {
  const tag = `${apply ? 'APPLY' : 'DRY RUN'}${friends ? ' + Friends' : ''}`
  try {
    const result = await runMigration({ apply, friends })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof MigrationSetupError) {
      console.error(`[price-migration] ${error.message}`)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    console.error(`[price-migration] ${tag} failed:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
