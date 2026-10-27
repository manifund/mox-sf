// Discord server configuration
// These IDs are public and can be checked in the Discord app

export const DISCORD_GUILD_ID = '1339404214081687675'

// Role IDs for membership tiers
export const DISCORD_ROLES = {
  FRIEND: '1395888120855134278',
  CORE: '1395888265919467680',
  RESIDENT: '1395877757585461407',
  PRIVATE_OFFICE: '1461980016999927875',
  PROGRAM: '1461978789956554806',
  GUEST_PROGRAM: '1465090219597627444',
} as const

// Channel IDs
export const DISCORD_CHANNELS = {
  DOOR_CODE: '1360304053887701092',
  PACKAGES: '1409615290353844397',
  NOTIFICATIONS: '1465054507816980523',
  ROOM_AVAILABILITY: '1466343013146951774',
  // Task board completions/approvals. The Mox bot (DISCORD_BOT_TOKEN) must have
  // View Channel + Read Message History here for the ✅-approval sweep to work.
  TASKS: '1523782328118149130',
} as const

// Message ID for the room availability status message that gets edited
export const DISCORD_ROOM_AVAILABILITY_MESSAGE_ID = '1466343657014558742'

// Map Airtable tiers to Discord role IDs
export const TIER_TO_ROLE: Record<string, string> = {
  Friend: DISCORD_ROLES.FRIEND,
  Core: DISCORD_ROLES.CORE,
  Resident: DISCORD_ROLES.RESIDENT,
  'Private Office': DISCORD_ROLES.PRIVATE_OFFICE,
  Program: DISCORD_ROLES.PROGRAM,
  'Guest Program': DISCORD_ROLES.GUEST_PROGRAM,
}

// All tier role IDs (for removing old roles when tier changes)
export const ALL_TIER_ROLE_IDS = Object.values(DISCORD_ROLES)

// Tiers that should have Discord roles synced
export const ACTIVE_TIERS = [
  'Friend',
  'Core',
  'Resident',
  'Private Office',
  'Program',
  'Guest Program',
]

// Explicit Airtable Program record -> Discord participant role mappings.
// Keep staff/organizer roles manual. IDs survive program and role renames.
export const PROGRAM_TO_ROLE: Record<string, string> = {
  recn4q015cMNH5ODe: '1554241448285835265', // Iliad Intensive -> Iliad
  recCAtlMZI1ufnVp7: '1528179642509430916', // Surplus
  recxogXh8sAENNXAH: '1546698924255871007', // Frame Fellowship #2
  recdwSj2sFAjDYVKZ: '1464541828656271472', // Frame Fellowship #1
  recjB8frjHMLgF9Hm: '1509657231832907786', // Sentient Futures Residency
  recaIlkSkyZKHQ0s2: '1395888939553919180', // Seldon Batch 2
  recw9GcgF3DwVsxO1: '1395888939553919180', // Seldon Batch 1
}
