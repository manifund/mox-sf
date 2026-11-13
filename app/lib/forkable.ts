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
  /**
   * Set when Forkable rejected the request itself (unknown mutation, wrong
   * arguments): every other removal would fail the same way.
   */
  rejectedBySchema?: boolean;
  /** Forkable's own club/member operations, to fix the request with. */
  apiHints?: string[];
  /**
   * Set when Forkable ran the removal and refused it for this person (for
   * example they are not in the club). Says nothing about anyone else.
   */
  refusedForMember?: boolean;
}

/**
 * Forkable publishes no API docs. `addMemberToClubs` above was copied from the
 * request the admin UI sends; this mutation was not, and is written by
 * symmetry with it.
 *
 * It does not need a browser to confirm. If Forkable does not know this
 * mutation it rejects the request before doing anything, and
 * removeMemberFromForkable then asks Forkable for its own list of club and
 * member operations (describeForkableApi) and returns it as `apiHints`. The
 * offboarding cron posts those hints to Discord, so the first failed run says
 * exactly what to change here: REMOVE_MEMBER_MUTATION, its result field, and
 * `removeMemberVariables`.
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
      const apiHints = await describeForkableApi(sessionCookie);
      if (apiHints.length) {
        console.error('[Forkable] Club/member operations Forkable offers:\n' + apiHints.join('\n'));
      }
      return {
        success: false,
        errors: data.errors.map((e: { message: string }) => e.message),
        rejectedBySchema: true,
        apiHints,
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
        refusedForMember: true,
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

// Introspection: the operations Forkable itself lists, with their arguments.
const TYPE_REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';
const DESCRIBE_OPERATIONS_QUERY = `
query {
  __schema {
    mutationType { fields { name args { name type { ${TYPE_REF} } } } }
    queryType { fields { name args { name type { ${TYPE_REF} } } } }
  }
}
`;

interface TypeRef {
  kind: string;
  name: string | null;
  ofType?: TypeRef | null;
}
interface FieldInfo {
  name: string;
  args?: { name: string; type: TypeRef }[];
}

function printType(type: TypeRef | null | undefined): string {
  if (!type) return '?';
  if (type.kind === 'NON_NULL') return `${printType(type.ofType)}!`;
  if (type.kind === 'LIST') return `[${printType(type.ofType)}]`;
  return type.name ?? '?';
}

function namedType(type: TypeRef | null | undefined): string | null {
  if (!type) return null;
  return type.name ?? namedType(type.ofType);
}

const RELEVANT_OPERATION = /member|club/i;
const MAX_HINTS = 30;

/**
 * Ask Forkable which club/member operations it has. Read-only: this is a
 * schema query and touches no member data. Returns lines such as
 * `mutation removeMembership(input: RemoveMembershipInput!) { membershipId: ID! }`,
 * or an empty list if Forkable will not say.
 */
export async function describeForkableApi(sessionCookie: string): Promise<string[]> {
  const ask = async (query: string) => {
    const response = await fetch(FORKABLE_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'forkable-referrer': 'mc',
        Cookie: `_easyorder_session=${sessionCookie}`,
      },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body.errors ? null : body.data;
  };

  try {
    const schema = (await ask(DESCRIBE_OPERATIONS_QUERY))?.__schema;
    if (!schema) return [];

    const operations: { kind: string; field: FieldInfo }[] = [
      ...(schema.mutationType?.fields ?? []).map((field: FieldInfo) => ({ kind: 'mutation', field })),
      ...(schema.queryType?.fields ?? []).map((field: FieldInfo) => ({ kind: 'query', field })),
    ]
      .filter(({ field }) => RELEVANT_OPERATION.test(field.name))
      .slice(0, MAX_HINTS);

    // Most mutations take a single `input` object; list its fields too.
    const inputTypes = [
      ...new Set(
        operations
          .flatMap(({ field }) => field.args ?? [])
          .map((arg) => namedType(arg.type))
          .filter((name): name is string => !!name && /Input$/.test(name))
      ),
    ];
    const inputFields: Record<string, string> = {};
    if (inputTypes.length) {
      const query = `query { ${inputTypes
        .map((name, i) => `t${i}: __type(name: "${name}") { name inputFields { name type { ${TYPE_REF} } } }`)
        .join(' ')} }`;
      const types = (await ask(query)) ?? {};
      for (const type of Object.values(types) as { name: string; inputFields?: { name: string; type: TypeRef }[] }[]) {
        if (!type?.inputFields) continue;
        inputFields[type.name] = type.inputFields
          .map((f) => `${f.name}: ${printType(f.type)}`)
          .join(', ');
      }
    }

    return operations.map(({ kind, field }) => {
      const args = (field.args ?? []).map((a) => `${a.name}: ${printType(a.type)}`).join(', ');
      const inputs = (field.args ?? [])
        .map((a) => inputFields[namedType(a.type) ?? ''])
        .filter(Boolean)
        .map((fields) => ` { ${fields} }`)
        .join('');
      return `${kind} ${field.name}(${args})${inputs}`;
    });
  } catch (error) {
    console.error('[Forkable] Could not describe the API:', error);
    return [];
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
