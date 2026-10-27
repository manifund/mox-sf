import { NextRequest, NextResponse } from 'next/server'
import { destroyClaimerSession } from '@/app/lib/tasks-auth'

export async function POST(request: NextRequest) {
  await destroyClaimerSession()
  return NextResponse.redirect(new URL('/tasks', request.url), { status: 303 })
}
