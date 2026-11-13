/**
 * Forkable API integration for adding members to (and removing them from)
 * meal clubs
 *
 * This module provides functionality to add and remove Forkable meal club
 * members by calling their GraphQL API directly.
 *
 * IMPORTANT: Requires FORKABLE_SESSION_COOKIE environment variable
 * To get this cookie:
 * 1. Log into forkable.com as an admin
 * 2. Open DevTools > Application > Cookies
 * 3. Copy the value of `_easyorder_session`
 */

import { env } from './env';

const FORKABLE_GRAPHQL_ENDPOINT = 'https://forkable.com/api/v2/graphql';

// Club IDs for Mox
export const FORKABLE_CLUBS = {
  MOX_MEMBERS: 6314,
  MOX_RESIDENTS: 7097,
  FLF_FELLOWSHIP: 6755,
} as const;

export type ForkableClubId = (typeof FORKABLE_CLUBS)[keyof typeof FORKABLE_CLUBS];

/**
 * The clubs a Mox membership can put someone in. Offboarding only ever touches
 * these: a person can also be in a club run by their own program (FLF, Iliad,
 * ...) and that club is not ours to remove them from.
 */
export const MOX_MEMBERSHIP_CLUBS: ForkableClubId[] = [
  FORKABLE_CLUBS.MOX_MEMBERS,
  FORKABLE_CLUBS.MOX_RESIDENTS,
];

interface AddMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  clubIds?: ForkableClubId[];
  startAsap?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  mealClubAutoOrder?: boolean;
  neverEnding?: boolean;
}

interface ForkableMembership {
  id: number;
  mealClubId: number;
  startDate: string | null;
  endDate: string | null;
  user: {
    id: number;
    name: string;
    fullName: string;
    email: string;
    invitationLink: string | null;
    claimed: boolean;
  };
}

interface AddMemberResponse {
  success: boolean;
  memberships?: ForkableMembership[];
  errors?: string[];
  errorAttributes?: string[];
}

const ADD_MEMBER_MUTATION = `
mutation ($input: AddMemberToClubsInput!) {
  addMemberToClubs(input: $input) {
    memberships {
      id
      mealClubId
      startDate
      endDate
      user {
        id
        name
        fullName
        email
        invitationLink
        claimed
      }
    }
    errors
    errorAttributes
  }
}
`;

/**
 * Add a member to Forkable meal club(s)
 *
 * @example
 * const result = await addMemberToForkable({
 *   email: 'newmember@example.com',
 *   firstName: 'John',
 *   lastName: 'Doe',
 * });
 */
export async function addMemberToForkable(
  input: AddMemberInput
): Promise<AddMemberResponse> {
  const sessionCookie = env.FORKABLE_SESSION_COOKIE;

  if (!sessionCookie) {
    console.error('[Forkable] Missing FORKABLE_SESSION_COOKIE environment variable');
    return {
      success: false,
      errors: ['Missing Forkable session cookie configuration'],
    };
  }

  const variables = {
    input: {
      clubIds: input.clubIds ?? [FORKABLE_CLUBS.MOX_MEMBERS],
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      startAsap: input.startAsap ?? true,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      mealClubAutoOrder: input.mealClubAutoOrder ?? false,
      neverEnding: input.neverEnding ?? true,
    },
  };

  try {
    const response = await fetch(FORKABLE_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'forkable-referrer': 'mc',
        Cookie: `_easyorder_session=${sessionCookie}`,
      },
      body: JSON.stringify({
        query: ADD_MEMBER_MUTATION,
        variables,
      }),
    });

    if (!response.ok) {
      console.error('[Forkable] HTTP error:', response.status, response.statusText);
      return {
        success: false,
        errors: [`HTTP ${response.status}: ${response.statusText}`],
      };
    }

    const data = await response.json();

    if (data.errors) {
      console.error('[Forkable] GraphQL errors:', data.errors);
      return {
        success: false,
        errors: data.errors.map((e: { message: string }) => e.message),
      };
    }

    const result = data.data?.addMemberToClubs;

    if (result?.errors) {
      console.error('[Forkable] Mutation errors:', result.errors);
      return {
        success: false,
        errors: result.errors,
        errorAttributes: result.errorAttributes,
      };
    }

    console.log(
      '[Forkable] Successfully added member:',
      input.email,
      'to clubs:',
      variables.input.clubIds
    );

    return {
      success: true,
      memberships: result?.memberships,
    };
  } catch (error) {
    console.error('[Forkable] Error adding member:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

interface RemoveMemberInput {
  email: string;
  /** Defaults to every Mox membership club. */
  clubIds?: ForkableClubId[];
}

interface RemoveMemberResponse {
  success: boolean;
  errors?: string[];
  errorAttributes?: string[];
}

/**
 * ⚠️ UNVERIFIED — DO NOT MERGE UNTIL CHECKED AGAINST FORKABLE.
 *
 * Forkable publishes no API docs. `addMemberToClubs` above was copied from the
 * request the admin UI sends; this mutation has NOT been captured yet and is
 * only a guess by symmetry with it. To verify:
 *
 * 1. Log into https://forkable.com/mc/admin/members as an admin
 * 2. Open DevTools > Network and filter for `graphql`
 * 3. Remove one member from a club in the UI
 * 4. Copy the request payload (`query` + `variables`) and replace
 *    REMOVE_MEMBER_MUTATION and `removeMemberVariables` below to match
 *
 * If the guess is wrong Forkable rejects the request before doing anything,
 * so the failure mode is "nobody is removed and staff get a Discord alert",
 * never a wrong removal.
 */
const REMOVE_MEMBER_MUTATION = `
mutation ($input: RemoveMemberFromClubsInput!) {
  removeMemberFromClubs(input: $input) {
    errors
    errorAttributes
  }
}
`;

const REMOVE_MEMBER_RESULT_FIELD = 'removeMemberFromClubs';

function removeMemberVariables(input: RemoveMemberInput) {
  return {
    input: {
      clubIds: input.clubIds ?? MOX_MEMBERSHIP_CLUBS,
      email: input.email,
    },
  };
}

/**
 * Remove a member from Forkable meal club(s)
 *
 * Only removes the club membership; the person's Forkable account and any
 * memberships in other clubs are left alone.
 *
 * @example
 * const result = await removeMemberFromForkable({
 *   email: 'formermember@example.com',
 * });
 */
export async function removeMemberFromForkable(
  input: RemoveMemberInput
): Promise<RemoveMemberResponse> {
  const sessionCookie = env.FORKABLE_SESSION_COOKIE;

  if (!sessionCookie) {
    console.error('[Forkable] Missing FORKABLE_SESSION_COOKIE environment variable');
    return {
      success: false,
      errors: ['Missing Forkable session cookie configuration'],
    };
  }

  const variables = removeMemberVariables(input);

  try {
    const response = await fetch(FORKABLE_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'forkable-referrer': 'mc',
        Cookie: `_easyorder_session=${sessionCookie}`,
      },
      body: JSON.stringify({
        query: REMOVE_MEMBER_MUTATION,
        variables,
      }),
    });

    if (!response.ok) {
      console.error('[Forkable] HTTP error:', response.status, response.statusText);
      return {
        success: false,
        errors: [`HTTP ${response.status}: ${response.statusText}`],
      };
    }

    const data = await response.json();

    if (data.errors) {
      console.error('[Forkable] GraphQL errors:', data.errors);
      return {
        success: false,
        errors: data.errors.map((e: { message: string }) => e.message),
      };
    }

    const result = data.data?.[REMOVE_MEMBER_RESULT_FIELD];

    // A response with no payload at all means the mutation did not run (e.g.
    // an expired session that still answers 200). Never report that as removed.
    if (!result) {
      console.error('[Forkable] Removal returned no result for:', input.email);
      return {
        success: false,
        errors: ['Forkable returned no result for the removal'],
      };
    }

    if (result.errors?.length) {
      console.error('[Forkable] Mutation errors:', result.errors);
      return {
        success: false,
        errors: result.errors,
        errorAttributes: result.errorAttributes,
      };
    }

    console.log(
      '[Forkable] Successfully removed member:',
      input.email,
      'from clubs:',
      variables.input.clubIds
    );

    return { success: true };
  } catch (error) {
    console.error('[Forkable] Error removing member:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Helper to parse a full name into first and last name
 */
export function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}
