import { getSeasonEvents, type SeasonQueryResult } from './season-events'

export type {
  SeasonCategory as FallSeasonCategory,
  SeasonEvent as FallSeasonEvent,
  SeasonQueryResult as FallSeasonQueryResult,
} from './season-events'

// Tag the Events table record with this to list it on /fallseason.
// Events also need Type = "Public" or "Members" (not Private) and Status = "Confirmed".
const FALL_SEASON_TAG = "Fall Season '26"

export function getFallSeasonEvents(): Promise<SeasonQueryResult> {
  return getSeasonEvents({ tag: FALL_SEASON_TAG, types: ['Public', 'Members'] })
}
