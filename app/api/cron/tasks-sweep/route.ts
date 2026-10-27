import { env } from '@/app/lib/env'
import { sweepTasks } from '@/app/lib/tasks-sweep'

/**
 * Task board sweep — nudges quiet claims, auto-releases stale ones, and closes
 * "In review" tasks that got a ✅ reaction on Discord. Runs every 15 minutes.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[Cron tasks-sweep] Unauthorized request')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await sweepTasks()
    return Response.json({ success: true, ...result })
  } catch (error) {
    console.error('[Cron tasks-sweep] Error:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
