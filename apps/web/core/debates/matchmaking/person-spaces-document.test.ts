import { print } from 'graphql';

import { describe, expect, it } from 'vitest';

import {
  type PersonSpacesQuery,
  buildPersonSpacesDocument,
  personSpacesAlias,
  readPersonSpaces,
} from './person-spaces-document';

const PERSON_A = '019fedae-72b6-7ab2-927a-df044d57c566';
const PERSON_B = '019fedae-72b6-7ab2-927a-df044d57c599';

describe('buildPersonSpacesDocument', () => {
  it('asks for both roles per person in one request, with the ids as variables', () => {
    const { document, variables, ids } = buildPersonSpacesDocument([PERSON_A, PERSON_B]);
    const source = print(document);

    expect(ids).toEqual([PERSON_A, PERSON_B]);
    expect(source).toContain(`${personSpacesAlias(0, 'member')}: spacesConnection`);
    expect(source).toContain(`${personSpacesAlias(1, 'editor')}: spacesConnection`);
    // Bound, never interpolated — the ids reach this from a presence feed.
    expect(source).not.toContain(PERSON_A);
    expect(variables.p0).toBe(PERSON_A.replace(/-/g, ''));
  });

  it('drops an id that cannot be asked about, and compacts the aliases behind it', () => {
    const { ids, variables } = buildPersonSpacesDocument(['not-an-id', PERSON_B]);

    // The survivor is alias 0, not alias 1 — which is exactly why `ids` is returned for decoding.
    expect(ids).toEqual([PERSON_B]);
    expect(variables.p0).toBe(PERSON_B.replace(/-/g, ''));
    expect(variables.p1).toBeUndefined();
  });

  // A document declaring a variable it never uses is rejected outright by `NoUnusedVariables`.
  it('declares no variables when there is nobody to ask about', () => {
    const { document, variables, ids } = buildPersonSpacesDocument([]);

    expect(ids).toEqual([]);
    expect(variables).toEqual({});
    expect(print(document)).not.toContain('$');
  });
});

describe('readPersonSpaces', () => {
  const response = (overrides: PersonSpacesQuery): PersonSpacesQuery => overrides;

  it('unions the two roles, because a space is one icon however you belong to it', () => {
    const spaces = readPersonSpaces(
      response({
        p0_member: { nodes: [{ id: 'space-one' }, { id: 'space-two' }] },
        p0_editor: { nodes: [{ id: 'space-two' }, { id: 'space-three' }] },
      }),
      [PERSON_A]
    );

    expect(spaces.get(PERSON_A)).toEqual(['spaceone', 'spacetwo', 'spacethree']);
  });

  // Everyone is a member of their own personal space, so leaving it in would put the same
  // meaningless icon on every row and offer a filter option matching exactly one person.
  it('leaves out the profile space the person is listed by', () => {
    const spaces = readPersonSpaces(
      response({ p0_member: { nodes: [{ id: PERSON_A }, { id: 'space-one' }] }, p0_editor: { nodes: [] } }),
      [PERSON_A]
    );

    expect(spaces.get(PERSON_A)).toEqual(['spaceone']);
  });

  it('decodes against alias order rather than the ids handed in', () => {
    const spaces = readPersonSpaces(
      response({
        p0_member: { nodes: [{ id: 'space-one' }] },
        p1_member: { nodes: [{ id: 'space-two' }] },
      }),
      [PERSON_A, PERSON_B]
    );

    expect(spaces.get(PERSON_A)).toEqual(['spaceone']);
    expect(spaces.get(PERSON_B)).toEqual(['spacetwo']);
  });

  it('survives a connection that did not come back, and a node with no id', () => {
    const spaces = readPersonSpaces(
      response({ p0_member: { nodes: [null, { id: null }, { id: 'space-one' }] }, p0_editor: null }),
      [PERSON_A]
    );

    expect(spaces.get(PERSON_A)).toEqual(['spaceone']);
  });

  // An answer for everyone asked about, so a row can tell "no spaces" from "not asked".
  it('keys every id it was given, even one the response says nothing about', () => {
    const spaces = readPersonSpaces(response({}), [PERSON_A, PERSON_B]);

    expect([...spaces.keys()]).toEqual([PERSON_A, PERSON_B]);
    expect(spaces.get(PERSON_B)).toEqual([]);
  });
});
