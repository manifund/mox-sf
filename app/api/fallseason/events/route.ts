import { NextResponse } from 'next/server'
import { getFallSeasonEvents } from '@/app/lib/fallseason-events'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const result = await getFallSeasonEvents()
    return NextResponse.json(result.events, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Fall-Season-Raw-Records': String(result.rawRecordCount),
        'X-Fall-Season-Save-The-Dates': String(result.saveTheDateCount),
      },
    })
  } catch (error) {
    console.error('[fallseason/events] Airtable fetch failed:', error)
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown Airtable fetch error',
      },
      { status: 503 }
    )
  }
}
