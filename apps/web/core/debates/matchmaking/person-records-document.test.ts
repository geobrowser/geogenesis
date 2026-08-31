import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { POSITION_VOTE_FILTER } from '../participant-positions';
import { POSITIONS_PER_PERSON, buildPersonRecordsDocument, isPersonId, personAlias } from './person-records-document';
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

  // Counted through the same filter `fetchParticipantPositions` reads, so a count on a row and the
  // positions listed anywhere else cannot come to mean different things. Curation (kind 0) is out,
  // and so are withdrawn responses, which are a vote *type* and mean "no side".
  it('counts positions through the shared filter', () => {
    expect(buildPersonRecordsDocument([A]).variables.positionFilter).toBe(POSITION_VOTE_FILTER);
    expect(POSITION_VOTE_FILTER.voteKind.in).toEqual([1, 2]);
    expect(POSITION_VOTE_FILTER.voteKind.in).not.toContain(0);
    expect(POSITION_VOTE_FILTER.voteType.in).toEqual([0, 1]);
    expect(POSITION_VOTE_FILTER.objectType.is).toBe(0);
  });

  // Both spellings reach this from the presence feed; rejecting the dashed one would drop that
  // person's record silently, and rejecting every id would send a query the server refuses.
  it('accepts a person id in either spelling', () => {
    expect(isPersonId(A)).toBe(true);
    expect(isPersonId('07842862-d2c3-654c-0324-a07bc7cce1a4')).toBe(true);
    expect(isPersonId('not-a-hex-id')).toBe(false);
    expect(isPersonId('')).toBe(false);
  });

  it('normalises the ids it sends while keeping the callers spelling', () => {
    const dashed = '07842862-d2c3-654c-0324-a07bc7cce1a4';
    const { variables, ids } = buildPersonRecordsDocument([dashed]);

    expect(variables.p0).toBe(A);
    expect(ids).toEqual([dashed]);
  });

  it('drops ids that would not make a valid query', () => {
    const { variables } = buildPersonRecordsDocument([A, 'not-a-hex-id', '']);

    expect(variables.p0).toBe(A);
    expect(variables.p1).toBeUndefined();
  });

  // Aliases are positional, so dropping an unusable id compacts every index after it. Decoding
  // against the caller's original list would then read one person's public record onto another's
  // row — the ids the document was built from are returned so the two cannot drift apart.
  it('reports the ids it queried, in alias order', () => {
    const { ids } = buildPersonRecordsDocument(['not-a-hex-id', A, B]);

    expect(ids).toEqual([A, B]);
  });

  // Parsing is not enough: a query that declares a variable it never uses is rejected by
  // `NoUnusedVariables` before it runs, so the empty document must declare none.
  it('is executable with nobody listed, not merely parseable', () => {
    const { document, variables, ids } = buildPersonRecordsDocument([]);
    const operation = document.definitions.find(d => d.kind === 'OperationDefinition');

    expect(ids).toEqual([]);
    expect(variables).toEqual({});
    expect(operation && 'variableDefinitions' in operation ? operation.variableDefinitions : []).toHaveLength(0);
    expect(print(document)).not.toContain('$');
  });

  it('declares every variable it uses, and no others', () => {
    const source = printed([A, B]);
    const declared = [...source.matchAll(/\$(\w+):/g)].map(m => m[1]);

    for (const name of declared) {
      // One occurrence is the declaration; a used variable appears at least twice.
      expect(source.match(new RegExp(`\\$${name}\\b`, 'g'))!.length).toBeGreaterThan(1);
    }
  });
});

describe('readPersonRecords', () => {
  /** A page of position rows, one per id given — repeat an id to model the same claim answered twice. */
  const positions = (claimIds: string[], totalCount = claimIds.length) => ({
    totalCount,
    nodes: claimIds.map(objectId => ({ objectId })),
  });

  it('puts each aliased answer back against the right person', () => {
    const records = readPersonRecords(
      {
        p0_positions: positions(['c1', 'c2']),
        p0_supported: { totalCount: 2, nodes: [{ fromEntityId: 'd1' }, { fromEntityId: 'd2' }] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: { createdAt: '1769726933' },
        p1_positions: positions(['c3']),
        p1_supported: { totalCount: 0, nodes: [] },
        p1_opposed: { totalCount: 1, nodes: [{ fromEntityId: 'd3' }] },
        p1_joined: { createdAt: '1785353035' },
      },
      [A, B]
    );

    expect(records.get(A)).toMatchObject({ positions: 2, debateIds: ['d1', 'd2'], truncated: false });
    expect(records.get(B)).toMatchObject({ positions: 1, debateIds: ['d3'] });
  });

  // A `userVotes` row is not a position. The same claim answered on both the stance and the veracity
  // axis is two rows, and one answered in two spaces is two more — both happen on the live graph, and
  // a row count would say a bigger number than the positions the rest of the app lists for them.
  it('counts a claim answered twice as one position', () => {
    const records = readPersonRecords(
      {
        p0_positions: positions(['c1', 'c1', 'c2']),
        p0_supported: { totalCount: 0, nodes: [] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: {},
      },
      [A]
    );

    expect(records.get(A)?.positions).toBe(2);
  });

  it('counts the same claim written in either spelling once', () => {
    const records = readPersonRecords(
      {
        p0_positions: positions(['3bf9b841187f8c71b74f892ba4e83b75', '3bf9b841-187f-8c71-b74f-892ba4e83b75']),
        p0_supported: { totalCount: 0, nodes: [] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: {},
      },
      [A]
    );

    expect(records.get(A)?.positions).toBe(1);
  });

  // Short is not the same as full. Someone holding exactly the page size has come back whole, and
  // withholding their count would be the boundary bug the relation cap already had once.
  it('does not call an exactly full page of positions short', () => {
    const claims = Array.from({ length: POSITIONS_PER_PERSON }, (_, i) => `c${i}`);
    const records = readPersonRecords(
      {
        p0_positions: positions(claims),
        p0_supported: { totalCount: 0, nodes: [] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: {},
      },
      [A]
    );

    expect(records.get(A)?.positionsTruncated).toBe(false);
    expect(records.get(A)?.positions).toBe(POSITIONS_PER_PERSON);
  });

  it('reports a short page of positions rather than a low count', () => {
    const records = readPersonRecords(
      {
        p0_positions: positions(['c1', 'c2'], 137),
        p0_supported: { totalCount: 0, nodes: [] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: {},
      },
      [A]
    );

    expect(records.get(A)?.positionsTruncated).toBe(true);
  });

  // Someone can be recorded on both sides of the same debate; it is still one debate argued.
  it('counts a debate once across both sides', () => {
    const records = readPersonRecords(
      {
        p0_positions: positions([]),
        p0_supported: { nodes: [{ fromEntityId: 'd1' }] },
        p0_opposed: { nodes: [{ fromEntityId: 'd1' }] },
        p0_joined: { createdAt: null },
      },
      [A]
    );

    expect(records.get(A)?.debateIds).toEqual(['d1']);
  });

  // The round trip an unusable id used to break: `A` is queried as `p0`, so decoding against the
  // caller's list would have handed `A`'s record to the invalid id and left `A` empty.
  it('keeps each record with the person it belongs to when an id was dropped', () => {
    const { ids } = buildPersonRecordsDocument(['not-a-hex-id', A]);
    const records = readPersonRecords(
      {
        p0_positions: positions(['c1']),
        p0_supported: { totalCount: 1, nodes: [{ fromEntityId: 'd1' }] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: { createdAt: '1769726933' },
      },
      ids
    );

    expect(records.get(A)?.positions).toBe(1);
    expect(records.has('not-a-hex-id')).toBe(false);
  });

  // A page that came back full is only short if the server says there is more. Someone sitting on
  // exactly the page size would otherwise have their record withheld forever.
  it('does not call a complete page truncated', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ fromEntityId: `d${i}` }));
    const empty = { totalCount: 0, nodes: [] };
    const full = readPersonRecords(
      { p0_positions: positions([]), p0_supported: { totalCount: 100, nodes }, p0_opposed: empty, p0_joined: {} },
      [A]
    );
    const short = readPersonRecords(
      { p0_positions: positions([]), p0_supported: { totalCount: 137, nodes }, p0_opposed: empty, p0_joined: {} },
      [A]
    );

    expect(full.get(A)?.truncated).toBe(false);
    expect(short.get(A)?.truncated).toBe(true);
  });

  // Truncation is measured against the ids actually collected, not the page length. A node the
  // collection loop skips — a null, or a `fromEntityId` elided by a partial GraphQL error — leaves
  // the page as long as `totalCount` while the record is a debate short, which is the silent
  // under-report the flag exists to prevent.
  it('is short when a node came back without an id', () => {
    const records = readPersonRecords(
      {
        p0_positions: positions([]),
        p0_supported: { totalCount: 2, nodes: [{ fromEntityId: 'd1' }, { fromEntityId: null }] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: {},
      },
      [A]
    );

    expect(records.get(A)?.debateIds).toEqual(['d1']);
    expect(records.get(A)?.truncated).toBe(true);
  });

  it('is short when a node came back null', () => {
    const records = readPersonRecords(
      {
        p0_positions: { totalCount: 2, nodes: [{ objectId: 'c1' }, null] },
        p0_supported: { totalCount: 1, nodes: [null] },
        p0_opposed: { totalCount: 0, nodes: [] },
        p0_joined: {},
      },
      [A]
    );

    expect(records.get(A)?.truncated).toBe(true);
    expect(records.get(A)?.positionsTruncated).toBe(true);
  });

  // A side that never arrived is not an empty side: counting only the side that did would report
  // part of someone's record as all of it, so the row withholds instead.
  it('treats a person missing from the response as unknown, not as having no record', () => {
    const records = readPersonRecords({}, [A]);

    expect(records.get(A)).toEqual({
      positions: 0,
      positionsTruncated: true,
      debateIds: [],
      truncated: true,
      createdAt: null,
    });
  });

  it('treats one missing side as truncated even when the other came back', () => {
    const records = readPersonRecords(
      {
        p0_positions: positions(['c1']),
        p0_supported: { totalCount: 1, nodes: [{ fromEntityId: 'd1' }] },
        p0_joined: {},
      },
      [A]
    );

    expect(records.get(A)?.truncated).toBe(true);
  });
});
