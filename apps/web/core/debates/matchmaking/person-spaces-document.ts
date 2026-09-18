import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { uuidToHex } from '~/core/id/normalize';
import { normId } from '~/core/utils/norm-id';

import { isPersonId } from './person-records-document';

/**
 * How many spaces are read per person per role.
 *
 * Generous rather than a limit: this feeds a row that shows a handful of icons and a filter whose
 * options are the spaces on screen, so a person in more spaces than this is already past what
 * either surface renders. Asking for fewer would make the *filter* wrong rather than the row —
 * a space cut from the tail here is a space the menu never offers.
 */
export const SPACES_PER_PERSON_ROLE = 50;

export type PersonSpacesQuery = Record<
  string,
  { nodes?: Array<{ id?: string | null } | null> | null } | null | undefined
>;

export type PersonSpacesVariables = Record<string, unknown>;

/** Positional, for the same reason `personAlias` is: a hex id cannot start a GraphQL name. */
export function personSpacesAlias(index: number, role: 'member' | 'editor') {
  return `p${index}_${role}`;
}

/**
 * Every listed person's spaces in one request.
 *
 * The same shape as `buildPersonRecordsDocument`, and for the same reason: `profile_space_id` is
 * the `memberSpaceId` that space membership is recorded against, so one aliased request answers
 * for the whole visible list instead of two per row. A tab showing twenty people would otherwise
 * open forty connections, and it re-asks whenever presence flaps.
 *
 * Both roles, because "the spaces this person is in" is what the row claims and an editor is not a
 * member of the space they edit. They are unioned on the way out — the row draws one icon per
 * space, not one per role.
 */
export function buildPersonSpacesDocument(personIds: string[]): {
  document: TypedDocumentNode<PersonSpacesQuery, PersonSpacesVariables>;
  variables: PersonSpacesVariables;
  /** The ids actually asked about, in alias order — see `buildPersonRecordsDocument`. */
  ids: string[];
} {
  const ids = personIds.filter(isPersonId);

  // A query declaring a variable it never uses is rejected by `NoUnusedVariables`, so an empty
  // document declares none. The hook keeps this disabled when there is nobody queryable; this is
  // what keeps the builder from being the thing that breaks if it is called anyway.
  if (ids.length === 0) {
    return {
      document: parse('query PersonSpaces { __typename }') as TypedDocumentNode<
        PersonSpacesQuery,
        PersonSpacesVariables
      >,
      variables: {},
      ids,
    };
  }

  const declarations = ['$first: Int!', ...ids.map((_, index) => `$p${index}: UUID!`)].join(', ');

  const selections = ids
    .map((_, index) => {
      const person = `$p${index}`;
      return `
    ${personSpacesAlias(index, 'member')}: spacesConnection(
      first: $first
      filter: { members: { some: { memberSpaceId: { is: ${person} } } } }
    ) { nodes { id } }
    ${personSpacesAlias(index, 'editor')}: spacesConnection(
      first: $first
      filter: { editors: { some: { memberSpaceId: { is: ${person} } } } }
    ) { nodes { id } }`;
    })
    .join('\n');

  const source = `query PersonSpaces(${declarations}) {${selections}\n  }`;

  const variables: PersonSpacesVariables = { first: SPACES_PER_PERSON_ROLE };
  // Normalised for the query; `ids` keeps the caller's spelling so a row can look its own spaces up
  // with the id it was handed.
  ids.forEach((id, index) => {
    variables[`p${index}`] = uuidToHex(id);
  });

  return {
    document: parse(source) as TypedDocumentNode<PersonSpacesQuery, PersonSpacesVariables>,
    variables,
    ids,
  };
}

/**
 * Decoded against the ids the document was built from, never the caller's list: aliases are
 * positional, so an id the builder dropped shifts every alias after it and would read one person's
 * spaces onto another's row.
 *
 * A person's own profile space is excluded. Everyone is a member of their own personal space, so
 * leaving it in would put the same meaningless icon on every row and offer a filter option that
 * matches exactly one person — the same exclusion `fetchEditorSpaceIds` already makes.
 */
export function readPersonSpaces(response: PersonSpacesQuery | undefined, ids: string[]): Map<string, string[]> {
  const byPerson = new Map<string, string[]>();
  if (!response) return byPerson;

  ids.forEach((id, index) => {
    const own = normId(id);
    const spaceIds = new Set<string>();

    for (const role of ['member', 'editor'] as const) {
      const connection = response[personSpacesAlias(index, role)];
      for (const node of connection?.nodes ?? []) {
        const spaceId = node?.id;
        if (!spaceId) continue;
        const normalized = normId(spaceId);
        if (normalized === own) continue;
        spaceIds.add(normalized);
      }
    }

    byPerson.set(id, [...spaceIds]);
  });

  return byPerson;
}
