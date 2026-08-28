import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { POSITION_VOTE_KINDS, buildPersonRecordsDocument, personAlias } from './person-records-document';
import { readPersonRecords } from './use-person-records';

const A = '07842862d2c3654c0324a07bc7cce1a4';
const B = 'a379046c74a140178e1c0545c72767c5';

const printed = (ids: string[]) => print(buildPersonRecordsDocument(ids).document);

describe('buildPersonRecordsDocument', () => {
  it('asks for every person in one request', () => {
    const source = printed([A, B]);

    // Four fields each, and no second operation.
    expect(source.match(/userVotesConnection/g)).toHaveLength(2);
    expect(source.match(/relationsConnection/g)).toHaveLength(4);
    expect(source.match(/entity\(/g)).toHaveLength(2);
    expect(source.match(/^query /gm)).toHaveLength(1);
  });

  // A hex id cannot start a GraphQL name — `07842862…` is not a valid alias — so aliases are
  // positional and the response is read back by the same index.
  it('aliases by position rather than by id', () => {
    const source = printed([A, B]);

    expect(source).toContain(`${personAlias(0, 'positions')}:`);
    expect(source).toContain(`${personAlias(1, 'joined')}:`);
    expect(source).not.toContain(A);
    expect(source).not.toContain(B);
  });

  it('passes ids as variables, never interpolated', () => {
    const { variables } = buildPersonRecordsDocument([A, B]);

    expect(variables.p0).toBe(A);
    expect(variables.p1).toBe(B);
    expect(printed([A, B])).toContain('$p0: UUID!');
  });

  // The votes table is mostly curation — 4,218 curation votes against 812 positions when measured.
  // Unfiltered, this field would be labelled "positions" and show something else entirely.
  it('scopes positions to stance and veracity, never curation', () => {
    expect(POSITION_VOTE_KINDS).toEqual([1, 2]);
    expect(POSITION_VOTE_KINDS).not.toContain(0);
    expect(buildPersonRecordsDocument([A]).variables.positionKinds).toEqual([1, 2]);
  });

  it('drops ids that would not make a valid query', () => {
    const { variables } = buildPersonRecordsDocument([A, 'not-a-hex-id', '']);

    expect(variables.p0).toBe(A);
    expect(variables.p1).toBeUndefined();
  });

  it('still parses with nobody listed', () => {
    expect(() => buildPersonRecordsDocument([])).not.toThrow();
  });
});

describe('readPersonRecords', () => {
  it('puts each aliased answer back against the right person', () => {
    const records = readPersonRecords(
      {
        p0_positions: { totalCount: 16 },
        p0_supported: { totalCount: 2, nodes: [{ fromEntityId: 'd1' }, { fromEntityId: 'd2' }] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: { createdAt: '1769726933' },
        p1_positions: { totalCount: 8 },
        p1_supported: { totalCount: 0, nodes: [] },
        p1_opposed: { totalCount: 1, nodes: [{ fromEntityId: 'd3' }] },
        p1_joined: { createdAt: '1785353035' },
      },
      [A, B]
    );

    expect(records.get(A)).toMatchObject({ positions: 16, debateIds: ['d1', 'd2'], truncated: false });
    expect(records.get(B)).toMatchObject({ positions: 8, debateIds: ['d3'] });
  });

  // Someone can be recorded on both sides of the same debate; it is still one debate argued.
  it('counts a debate once across both sides', () => {
    const records = readPersonRecords(
      {
        p0_positions: { totalCount: 0 },
        p0_supported: { nodes: [{ fromEntityId: 'd1' }] },
        p0_opposed: { nodes: [{ fromEntityId: 'd1' }] },
        p0_joined: { createdAt: null },
      },
      [A]
    );

    expect(records.get(A)?.debateIds).toEqual(['d1']);
  });

  it('reads a missing person as an empty record rather than dropping the row', () => {
    const records = readPersonRecords({}, [A]);

    expect(records.get(A)).toEqual({ positions: 0, debateIds: [], truncated: false, createdAt: null });
  });
});
