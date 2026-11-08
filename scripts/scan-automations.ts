#!/usr/bin/env bun
// Scan the codebase for automation routes and generate a manifest.
//
// Usage: bun scripts/scan-automations.ts
//
// Cross-references vercel.json for cron schedules.
// Outputs app/lib/automations-manifest.ts (imported by the dashboard).

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(import.meta.dir, '..')
const APP_DIR = join(ROOT, 'app')
const VERCEL_JSON = join(ROOT, 'vercel.json')
const OUTPUT_FILE = join(APP_DIR, 'lib', 'automations-manifest.ts')

// Routes that are automations (not just CRUD/read endpoints)
// We detect these by: cron/*, webhooks/*, known automation routes, or withAutomation usage
const AUTOMATION_DIRS = [
  'api/cron',
  'api/webhooks',
  'api/forkable-sync',
]

// Portal routes that are actually automations (not just data fetches)
const PORTAL_AUTOMATION_ROUTES = [
  'portal/api/sync-discord-role',
  'portal/api/bulk-sync-discord-roles',
  'portal/api/pause-subscription',
  'portal/api/migrate-membership-prices',
  'portal/api/send-magic-link',
  'portal/api/unlock-door',
]

// Other known automation routes outside standard dirs
const OTHER_AUTOMATION_ROUTES = [
  'eag26/api/register',
  'day-pass/activate/api',
  'door/api/validate',
]

interface CronConfig {
  path: string
  schedule: string
}

interface AutomationEntry {
  id: string
  filePath: string
  routePath: string
  type: 'cron' | 'webhook' | 'integration' | 'portal-action' | 'event-action'
  cronSchedule?: string
  httpMethod: string
}

// ============================================================================
// Discovery
// ============================================================================

function loadCronSchedules(): Map<string, string> {
  const schedules = new Map<string, string>()
  if (!existsSync(VERCEL_JSON)) return schedules

  const config = JSON.parse(readFileSync(VERCEL_JSON, 'utf-8'))
  for (const cron of (config.crons || []) as CronConfig[]) {
    schedules.set(cron.path, cron.schedule)
  }
  return schedules
}

function findRouteFiles(dir: string): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...findRouteFiles(full))
    } else if (entry === 'route.ts') {
      results.push(full)
    }
  }
  return results
}

function detectHttpMethod(content: string): string {
  const methods: string[] = []
  if (/export\s+(async\s+)?function\s+GET/m.test(content)) methods.push('GET')
  if (/export\s+(async\s+)?function\s+POST/m.test(content)) methods.push('POST')
  if (/export\s+(async\s+)?function\s+PUT/m.test(content)) methods.push('PUT')
  if (/export\s+(async\s+)?function\s+PATCH/m.test(content)) methods.push('PATCH')
  if (/export\s+(async\s+)?function\s+DELETE/m.test(content)) methods.push('DELETE')
  if (/export\s+const\s+GET\s*=/m.test(content) && !methods.includes('GET')) methods.push('GET')
  if (/export\s+const\s+POST\s*=/m.test(content) && !methods.includes('POST')) methods.push('POST')
  return methods.join(', ') || 'GET'
}

function classifyRoute(routePath: string): AutomationEntry['type'] {
  if (routePath.startsWith('api/cron/')) return 'cron'
  if (routePath.startsWith('api/webhooks/')) return 'webhook'
  if (routePath.startsWith('portal/api/')) return 'portal-action'
  if (routePath.startsWith('eag26/') || routePath.startsWith('day-pass/')) return 'event-action'
  return 'integration'
}

function deriveId(routePath: string): string {
  // "api/cron/rotate-door-code" -> "cron/rotate-door-code"
  return routePath
    .replace(/^api\//, '')
    .replace(/\/api\//, '/')
}

function scanAutomations(): AutomationEntry[] {
  const cronSchedules = loadCronSchedules()
  const entries: AutomationEntry[] = []
  const seen = new Set<string>()

  // Scan automation directories
  for (const dir of AUTOMATION_DIRS) {
    const fullDir = join(APP_DIR, dir)
    for (const routeFile of findRouteFiles(fullDir)) {
      const relPath = relative(APP_DIR, routeFile)
      const routePath = relPath.replace(/\/route\.ts$/, '')
      if (seen.has(routePath)) continue
      seen.add(routePath)

      const content = readFileSync(routeFile, 'utf-8')
      const apiPath = '/' + routePath
      entries.push({
        id: deriveId(routePath),
        filePath: 'app/' + relPath,
        routePath: apiPath,
        type: classifyRoute(routePath),
        cronSchedule: cronSchedules.get(apiPath),
        httpMethod: detectHttpMethod(content),
      })
    }
  }

  // Scan known portal automation routes
  for (const route of PORTAL_AUTOMATION_ROUTES) {
    const routeFile = join(APP_DIR, route, 'route.ts')
    if (!existsSync(routeFile) || seen.has(route)) continue
    seen.add(route)

    const relPath = relative(APP_DIR, routeFile)
    const content = readFileSync(routeFile, 'utf-8')
    entries.push({
      id: deriveId(route),
      filePath: 'app/' + relPath,
      routePath: '/' + route,
      type: 'portal-action',
      httpMethod: detectHttpMethod(content),
    })
  }

  // Scan other known automation routes
  for (const route of OTHER_AUTOMATION_ROUTES) {
    const routeFile = join(APP_DIR, route, 'route.ts')
    if (!existsSync(routeFile) || seen.has(route)) continue
    seen.add(route)

    const relPath = relative(APP_DIR, routeFile)
    const content = readFileSync(routeFile, 'utf-8')
    entries.push({
      id: deriveId(route),
      filePath: 'app/' + relPath,
      routePath: '/' + route,
      type: 'event-action',
      httpMethod: detectHttpMethod(content),
    })
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id))
}

// ============================================================================
// Output
// ============================================================================

function generateManifest(entries: AutomationEntry[]): string {
  const lines = [
    '// Auto-generated by scripts/scan-automations.ts',
    '// Do not edit manually. Run: bun scripts/scan-automations.ts',
    '',
    'export interface AutomationManifestEntry {',
    '  id: string',
    '  filePath: string',
    '  routePath: string',
    "  type: 'cron' | 'webhook' | 'integration' | 'portal-action' | 'event-action'",
    '  cronSchedule?: string',
    '  httpMethod: string',
    '  /** Hand-edited summary. Edit in this file if wrong. */',
    '  summary: string',
    '}',
    '',
    'export const AUTOMATIONS: AutomationManifestEntry[] = ',
  ]

  // Build array with summary placeholders
  const manifestEntries = entries.map((e) => ({
    ...e,
    summary: lookupExistingSummary(e.id) || `TODO: describe ${e.id}`,
  }))

  lines.push(JSON.stringify(manifestEntries, null, 2))
  lines.push('')

  return lines.join('\n')
}

/** If manifest already exists, preserve hand-written or AI-generated summaries. */
function lookupExistingSummary(id: string): string | null {
  if (!existsSync(OUTPUT_FILE)) return null

  try {
    const content = readFileSync(OUTPUT_FILE, 'utf-8')
    // Find the entry in the existing file by regex
    const pattern = new RegExp(`"id":\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^}]*"summary":\\s*"([^"]*)"`)
    const match = content.match(pattern)
    if (match && !match[1].startsWith('TODO:')) {
      return match[1]
    }
  } catch {
    // File exists but couldn't parse - that's fine
  }
  return null
}

// ============================================================================
// Main
// ============================================================================

const entries = scanAutomations()

console.log(`Found ${entries.length} automations:\n`)
for (const e of entries) {
  const schedule = e.cronSchedule ? ` (${e.cronSchedule})` : ''
  console.log(`  ${e.id} — ${e.type}${schedule} — ${e.filePath}`)
}

const manifest = generateManifest(entries)
writeFileSync(OUTPUT_FILE, manifest)
console.log(`\nWrote manifest to ${relative(ROOT, OUTPUT_FILE)}`)
