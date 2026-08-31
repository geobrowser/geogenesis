import { describe, expect, it, vi } from 'vitest';

import type { ImportMapInput } from '~/core/chat/import/mapping-types';

import type { SubmitMappingInput } from './schema';

// Same shims the geo-query route test uses: the module pulls in the Anthropic
// client, the Upstash limiters and the SDK config at import time, none of which
// the pure helpers touch.
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => ({}) }));
vi.mock('../rate-limit', () => ({ ipCeilingLimit: {}, loggedInLimit: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('~/core/environment/environment', () => ({
  getConfig: () => ({ chainId: '1', rpc: 'https://rpc.example', api: 'https://api.example/graphql' }),
}));

const { buildMapping, dedupeById, lookupTypes, rankBySpace, renderColumns, typeSourceSpaces, validateInput } =
  await import('./route');

const ROOT_SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';
const CRYPTO_SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const AI_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const UNRANKED_SPACE = '9'.repeat(32);
const TECHNOLOGY_SPACE = '870e3b3068661e6280fad2ab456829bc';
const MEMBER_SPACE = '7'.repeat(32);

const SPACE = 'c9267dcb0d270718c2a3c45a64afd32a';
const PROJECT_TYPE = 'a'.repeat(32);
const PERSON_TYPE = 'b'.repeat(32);
const WEBSITE_PROP = 'c'.repeat(32);
const FOUNDERS_PROP = 'd'.repeat(32);
const KNOWN_TYPES = new Set([PROJECT_TYPE, PERSON_TYPE]);

function input(overrides: Partial<ImportMapInput> = {}): ImportMapInput {
  return {
    spaceId: SPACE,
    fileName: 'projects.csv',
    rowCount: 340,
    columns: [
      { index: 0, header: 'Name', samples: ['Ethereum'], filled: 340 },
      { index: 1, header: 'URL', samples: ['https://ethereum.org'], filled: 338 },
      { index: 2, header: 'Founders', samples: ['Vitalik Buterin'], filled: 300 },
    ],
    ...overrides,
  };
}

function submission(overrides: Partial<SubmitMappingInput> = {}): SubmitMappingInput {
  return {
    typeId: PROJECT_TYPE,
    typeName: 'Project',
    nameColumn: 0,
    summary: 'Mapped everything.',
    columns: [
      { index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'text' },
      {
        index: 2,
        kind: 'relation',
        propertyId: FOUNDERS_PROP,
        propertyName: 'Founders',
        relationTypeIds: [PERSON_TYPE],
      },
    ],
    ...overrides,
  };
}

function build(sub: SubmitMappingInput, inp = input()) {
  return buildMapping(sub, inp, KNOWN_TYPES);
}

function mapping(sub: SubmitMappingInput, inp = input()) {
  const result = build(sub, inp);
  if ('error' in result) throw new Error(`expected a mapping, got ${result.error}`);
  return result;
}

describe('rankBySpace', () => {
  const match = (id: string, ...spaceIds: string[]) => ({ id, spaces: spaceIds.map(spaceId => ({ spaceId })) });

  it('puts the current space first, ahead of Root', () => {
    // A property this space defines for itself beats the canonical one: the
    // import is landing here, so this space's own vocabulary wins.
    const ranked = rankBySpace([match('root', ROOT_SPACE_ID), match('mine', AI_SPACE)], AI_SPACE);
    expect(ranked.map(m => m.id)).toEqual(['mine', 'root']);
  });

  it('falls back to Root over any other ranked space', () => {
    const ranked = rankBySpace([match('crypto', CRYPTO_SPACE), match('root', ROOT_SPACE_ID)], AI_SPACE);
    expect(ranked.map(m => m.id)).toEqual(['root', 'crypto']);
  });

  it('ranks known spaces ahead of unknown ones', () => {
    const ranked = rankBySpace([match('nowhere', UNRANKED_SPACE), match('crypto', CRYPTO_SPACE)], AI_SPACE);
    expect(ranked.map(m => m.id)).toEqual(['crypto', 'nowhere']);
  });

  it('scores a multi-space property by its best space', () => {
    const ranked = rankBySpace([match('a', UNRANKED_SPACE), match('b', UNRANKED_SPACE, ROOT_SPACE_ID)], AI_SPACE);
    expect(ranked.map(m => m.id)).toEqual(['b', 'a']);
  });

  it('is stable — equal ranks keep the API relevance order', () => {
    const ranked = rankBySpace(
      [match('first', ROOT_SPACE_ID), match('second', ROOT_SPACE_ID), match('third', ROOT_SPACE_ID)],
      AI_SPACE
    );
    expect(ranked.map(m => m.id)).toEqual(['first', 'second', 'third']);
  });

  it('keeps every match — this orders, it does not filter', () => {
    // The slice that follows is what drops candidates. Ranking exists so that
    // slice keeps the best six rather than an arbitrary six.
    const input = [match('a', UNRANKED_SPACE), match('b', ROOT_SPACE_ID), match('c')];
    expect(rankBySpace(input, AI_SPACE)).toHaveLength(3);
  });

  it('survives a property with no spaces, sorting it last', () => {
    const ranked = rankBySpace([match('homeless'), match('root', ROOT_SPACE_ID)], AI_SPACE);
    expect(ranked.map(m => m.id)).toEqual(['root', 'homeless']);
  });

  it('handles an empty list', () => {
    expect(rankBySpace([], AI_SPACE)).toEqual([]);
  });
});

describe('renderColumns with pre-fetched candidates', () => {
  const candidates = new Map([
    [0, [{ name: 'Name', dataType: 'Text', id: 'n'.repeat(32) }]],
    [1, [{ name: 'Website', dataType: 'Text', id: WEBSITE_PROP }]],
    [2, []],
  ]);

  it('lists every column with what was found for it', () => {
    const rendered = renderColumns(input(), candidates);
    expect(rendered).toContain('"Website" (Text, id ' + WEBSITE_PROP);
  });

  it('says so explicitly when a column found nothing', () => {
    // Silence would read as "not looked up". The point of the pre-search is
    // that "we looked and found nothing" is distinguishable from "we never
    // asked" — the second is what let `role` be skipped while a canonical
    // `Role` property sat there unexamined.
    expect(renderColumns(input(), candidates)).toContain('candidates: none found');
  });

  it('leaves the prompt unchanged when no pre-search ran', () => {
    // The fallback path: a failed pre-search must degrade to the old prompt,
    // not to a prompt claiming every column has no candidates.
    const rendered = renderColumns(input());
    expect(rendered).not.toContain('candidates:');
  });

  it('still renders every column when candidates are missing for some', () => {
    const partial = new Map([[1, [{ name: 'Website', dataType: 'Text', id: WEBSITE_PROP }]]]);
    const rendered = renderColumns(input(), partial);
    expect(rendered).toContain('[0]');
    expect(rendered).toContain('[2]');
    expect(rendered.match(/candidates: none found/g)).toHaveLength(2);
  });
});

describe('hint', () => {
  it('survives validateInput', () => {
    // It did not, for a while: the tool declared `hint`, the dispatcher sent it,
    // and the route dropped it on the floor — so every correction re-ran the
    // identical input and returned the identical mapping.
    expect(validateInput({ ...input(), hint: 'these are People, not Projects' })).toMatchObject({
      hint: 'these are People, not Projects',
    });
  });

  it('is absent rather than empty when not supplied', () => {
    expect(validateInput(input())).not.toHaveProperty('hint');
    expect(validateInput({ ...input(), hint: '   ' })).not.toHaveProperty('hint');
    expect(validateInput({ ...input(), hint: 42 })).not.toHaveProperty('hint');
  });

  it('is capped', () => {
    const result = validateInput({ ...input(), hint: 'x'.repeat(1000) });
    expect(result?.hint).toHaveLength(400);
  });

  it('reaches the model, marked as a correction to honour', () => {
    const rendered = renderColumns({ ...input(), hint: 'Sector should be Topics' });
    expect(rendered).toContain('Sector should be Topics');
    expect(rendered).toMatch(/asked for a change/i);
  });

  it('adds nothing to the prompt when absent', () => {
    expect(renderColumns(input())).not.toMatch(/asked for a change/i);
  });
});

describe('typeSourceSpaces', () => {
  it('puts the target space first', () => {
    // Order decides the dedupe winner: a type this space defines should beat a
    // namesake from anywhere else.
    expect(typeSourceSpaces(SPACE)[0]).toBe(SPACE);
  });

  it('always includes root', () => {
    // The regression this guards: scoping to the current space alone hides
    // `Project` from the AI space, which holds 1,535 of them but defines the
    // type in root.
    expect(typeSourceSpaces(SPACE)).toContain(ROOT_SPACE_ID);
  });

  it('includes the curated spaces, so their vocabulary is searched at all', () => {
    // Ranking sorts candidates; only scope produces them. `Facebook` lives in
    // Technology and is non-canonical, so it stayed invisible until Technology
    // was in the search scope — being *trusted* was not enough.
    const spaces = typeSourceSpaces(SPACE);
    expect(spaces).toContain(TECHNOLOGY_SPACE);
    expect(spaces).toContain(CRYPTO_SPACE);
    expect(spaces).toContain(AI_SPACE);
  });

  it('includes the spaces the client says the user can reach, ahead of the curated list', () => {
    const spaces = typeSourceSpaces(SPACE, [MEMBER_SPACE]);
    expect(spaces[0]).toBe(SPACE);
    expect(spaces[1]).toBe(MEMBER_SPACE);
    expect(spaces).toContain(ROOT_SPACE_ID);
  });

  it('lists every space once', () => {
    const spaces = typeSourceSpaces(SPACE, [ROOT_SPACE_ID, SPACE, CRYPTO_SPACE]);
    expect(new Set(spaces).size).toBe(spaces.length);
  });

  it('drops ids that are not ids', () => {
    expect(typeSourceSpaces(SPACE, ['not-an-id', ''])).not.toContain('not-an-id');
  });
});

describe('searchSpaceIds', () => {
  it('is carried through validateInput', () => {
    expect(validateInput({ ...input(), searchSpaceIds: [CRYPTO_SPACE, AI_SPACE] })).toMatchObject({
      searchSpaceIds: [CRYPTO_SPACE, AI_SPACE],
    });
  });

  it('normalises hyphenated ids', () => {
    const hyphenated = '41e85161-0e13-a194-41c4-d980f2f2ce6b';
    expect(validateInput({ ...input(), searchSpaceIds: [hyphenated] })?.searchSpaceIds).toEqual([AI_SPACE]);
  });

  it('is absent rather than empty when not supplied', () => {
    expect(validateInput(input())).not.toHaveProperty('searchSpaceIds');
    expect(validateInput({ ...input(), searchSpaceIds: 'nope' })).not.toHaveProperty('searchSpaceIds');
    expect(validateInput({ ...input(), searchSpaceIds: ['garbage'] })).not.toHaveProperty('searchSpaceIds');
  });

  it('is capped so a crafted body cannot widen the search without limit', () => {
    const many = Array.from({ length: 500 }, (_, i) => i.toString(16).padStart(32, '0'));
    expect(validateInput({ ...input(), searchSpaceIds: many })?.searchSpaceIds).toHaveLength(100);
  });
});

describe('dedupeById', () => {
  it('keeps the first occurrence, so caller order is precedence', () => {
    const items = [
      { id: 'a', from: 'current' },
      { id: 'a', from: 'root' },
      { id: 'b', from: 'root' },
    ];
    expect(dedupeById(items)).toEqual([
      { id: 'a', from: 'current' },
      { id: 'b', from: 'root' },
    ]);
  });

  it('preserves order and handles an empty list', () => {
    expect(dedupeById([])).toEqual([]);
    expect(dedupeById([{ id: 'x' }, { id: 'y' }, { id: 'x' }])).toEqual([{ id: 'x' }, { id: 'y' }]);
  });
});

describe('lookupTypes', () => {
  // The first page a big space hands back. `Person` is deliberately absent —
  // in the root space it really does sit past the 60-type cap, which is what
  // broke the very first import anyone tried.
  const PAGE = [
    { id: 'e'.repeat(32), name: 'City' },
    { id: 'f'.repeat(32), name: 'Project' },
  ];
  const PERSON = { id: PERSON_TYPE, name: 'Person' };

  it('returns the page verbatim when there is no needle, and says it is partial', async () => {
    const search = vi.fn();
    const result = await lookupTypes({ needle: undefined, page: PAGE, pageTruncated: true, search });

    expect(result).toEqual({ types: PAGE, truncated: true });
    expect(search).not.toHaveBeenCalled();
  });

  it('reports a complete page as complete', async () => {
    const result = await lookupTypes({ needle: undefined, page: PAGE, pageTruncated: false, search: vi.fn() });
    expect(result.truncated).toBe(false);
  });

  it('searches at the source rather than filtering the page', async () => {
    // The regression. `Person` is not in PAGE, so an in-memory filter returns
    // nothing however many synonyms the model tries.
    const search = vi.fn(async () => [PERSON]);
    const result = await lookupTypes({ needle: 'person', page: PAGE, pageTruncated: true, search });

    expect(search).toHaveBeenCalledWith('person');
    expect(result.types).toEqual([PERSON]);
    expect(result.truncated).toBe(false);
  });

  it('trims the needle before searching', async () => {
    const search = vi.fn(async () => [PERSON]);
    await lookupTypes({ needle: '  person  ', page: PAGE, pageTruncated: true, search });
    expect(search).toHaveBeenCalledWith('person');
  });

  it('treats a blank needle as no needle', async () => {
    const search = vi.fn();
    const result = await lookupTypes({ needle: '   ', page: PAGE, pageTruncated: true, search });

    expect(search).not.toHaveBeenCalled();
    expect(result.types).toEqual(PAGE);
  });

  it('an empty search result is empty, not the page', async () => {
    // "The space has no such type" has to be distinguishable from "here is the
    // page again", or the model cannot tell a dead end from a bad query.
    const result = await lookupTypes({ needle: 'sasquatch', page: PAGE, pageTruncated: true, search: async () => [] });
    expect(result.types).toEqual([]);
  });

  it('falls back to filtering the page when the search fails', async () => {
    const search = vi.fn(async () => {
      throw new Error('upstream down');
    });
    const result = await lookupTypes({ needle: 'proj', page: PAGE, pageTruncated: true, search });

    expect(result.types).toEqual([{ id: 'f'.repeat(32), name: 'Project' }]);
    // Still partial: the fallback only saw one page, so the model should not
    // read an empty-ish result as proof the type does not exist.
    expect(result.truncated).toBe(true);
  });

  it('survives a nameless type in the fallback filter', async () => {
    const search = async () => {
      throw new Error('upstream down');
    };
    const page = [{ id: 'a'.repeat(32), name: null }];
    await expect(lookupTypes({ needle: 'x', page, pageTruncated: false, search })).resolves.toEqual({
      types: [],
      truncated: true,
    });
  });
});

describe('validateInput', () => {
  it('accepts a well-formed body', () => {
    expect(validateInput(input())).toMatchObject({ spaceId: SPACE, rowCount: 340 });
  });

  it('normalizes a dashed space id', () => {
    const dashed = 'c9267dcb-0d27-0718-c2a3-c45a64afd32a';
    expect(validateInput({ ...input(), spaceId: dashed })?.spaceId).toBe(SPACE);
  });

  it('rejects a body with no usable space', () => {
    expect(validateInput({ ...input(), spaceId: 'nope' })).toBeNull();
    expect(validateInput({ ...input(), spaceId: undefined })).toBeNull();
  });

  it('rejects a body with no columns', () => {
    expect(validateInput({ ...input(), columns: [] })).toBeNull();
    expect(validateInput({ ...input(), columns: 'nope' })).toBeNull();
  });

  it('rejects a file with absurdly many columns', () => {
    const columns = Array.from({ length: 61 }, (_, i) => ({ index: i, header: `c${i}`, samples: [], filled: 0 }));
    expect(validateInput({ ...input(), columns })).toBeNull();
  });

  it('caps samples per column so the prompt cannot be inflated from the client', () => {
    // Everything validated here goes straight into a model prompt, so an
    // unbounded body is an unbounded bill.
    const columns = [{ index: 0, header: 'Name', samples: Array.from({ length: 50 }, (_, i) => `v${i}`), filled: 50 }];
    expect(validateInput({ ...input(), columns })?.columns[0].samples).toHaveLength(5);
  });

  it('truncates an enormous sample value', () => {
    const columns = [{ index: 0, header: 'Notes', samples: ['x'.repeat(5000)], filled: 1 }];
    const sample = validateInput({ ...input(), columns })?.columns[0].samples[0] ?? '';
    expect(sample.length).toBeLessThanOrEqual(121);
  });

  it('drops non-string samples rather than rendering them as [object Object]', () => {
    const columns = [{ index: 0, header: 'Name', samples: ['ok', { evil: true }, 42], filled: 1 }];
    expect(validateInput({ ...input(), columns })?.columns[0].samples).toEqual(['ok']);
  });

  it('rejects a negative or fractional column index', () => {
    expect(validateInput({ ...input(), columns: [{ index: -1, header: 'x', samples: [], filled: 0 }] })).toBeNull();
    expect(validateInput({ ...input(), columns: [{ index: 1.5, header: 'x', samples: [], filled: 0 }] })).toBeNull();
  });
});

describe('renderColumns', () => {
  it('shows headers, fill counts and samples — and no rows', () => {
    const rendered = renderColumns(input());

    expect(rendered).toContain('[1] "URL" — 338/340 filled');
    expect(rendered).toContain('"https://ethereum.org"');
    expect(rendered).toContain('Rows: 340');
  });

  it('says so when a column is entirely blank', () => {
    const rendered = renderColumns(input({ columns: [{ index: 0, header: 'Notes', samples: [], filled: 0 }] }));

    expect(rendered).toContain('(all blank)');
  });
});

describe('buildMapping', () => {
  it('builds a mapping from a good submission', () => {
    const result = mapping(submission());

    expect(result).toMatchObject({ typeId: PROJECT_TYPE, typeName: 'Project', nameColumn: 0 });
    expect(result.columns).toHaveLength(2);
  });

  it('refuses a type the space does not define', () => {
    // The model can only choose from what listTypes returned; anything else is
    // a hallucinated id that would create a broken Types relation.
    expect(build(submission({ typeId: 'f'.repeat(32) }))).toEqual({ error: 'mapping_failed' });
  });

  it('refuses a name column that is not a column of this file', () => {
    expect(build(submission({ nameColumn: 99 }))).toEqual({ error: 'mapping_failed' });
  });

  it('does not also map the name column as a property', () => {
    // The name is written from `nameColumn`; mapping it again would emit the
    // same value twice, once under the wrong property.
    const result = mapping(
      submission({
        columns: [
          { index: 0, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'text' },
          { index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'text' },
        ],
      })
    );

    expect(result.columns.find(c => c.index === 0)).toBeUndefined();
  });

  it('skips a column whose coercion rule is not one we implement', () => {
    // The closed enum is the guard; this is what happens if a rule slips past
    // it. Skipping beats falling through to a default that mangles the column.
    const result = mapping(
      submission({
        columns: [{ index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'vibes' }],
      })
    );

    expect(result.columns.find(c => c.index === 1)).toMatchObject({ kind: 'skip' });
  });

  it('skips a column with a malformed property id instead of writing to nothing', () => {
    const result = mapping(
      submission({
        columns: [{ index: 1, kind: 'value', propertyId: 'not-an-id', propertyName: 'Website', coercion: 'text' }],
      })
    );

    expect(result.columns.find(c => c.index === 1)).toMatchObject({ kind: 'skip' });
  });

  it('drops relation types the space does not define', () => {
    // A hallucinated type id would narrow resolution to nothing and quietly
    // resolve every cell in the column to no entity at all.
    const result = mapping(
      submission({
        columns: [
          {
            index: 2,
            kind: 'relation',
            propertyId: FOUNDERS_PROP,
            propertyName: 'Founders',
            relationTypeIds: [PERSON_TYPE, 'e'.repeat(32)],
          },
        ],
      })
    );

    expect(result.columns.find(c => c.index === 2)).toMatchObject({
      kind: 'relation',
      relationTypeIds: [PERSON_TYPE],
    });
  });

  it('accounts for every column of the file, even ones the model forgot', () => {
    // The user should see one row per column of their own file. A column the
    // model never mentioned is "not mapped", not invisible.
    const result = mapping(submission({ columns: [] }));

    expect(result.columns.map(c => c.index)).toEqual([1, 2]);
    expect(result.columns.every(c => c.kind === 'skip')).toBe(true);
  });

  it('ignores a column index that is not in the file', () => {
    const result = mapping(
      submission({
        columns: [{ index: 42, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'X', coercion: 'text' }],
      })
    );

    expect(result.columns.find(c => c.index === 42)).toBeUndefined();
  });

  it('keeps only the first mapping when a column is submitted twice', () => {
    const result = mapping(
      submission({
        columns: [
          { index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'text' },
          { index: 1, kind: 'skip', reason: 'changed my mind' },
        ],
      })
    );

    expect(result.columns.filter(c => c.index === 1)).toHaveLength(1);
    expect(result.columns.find(c => c.index === 1)).toMatchObject({ kind: 'value' });
  });

  it('returns columns in file order', () => {
    const result = mapping(
      submission({
        columns: [
          { index: 2, kind: 'skip', reason: 'later' },
          { index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'text' },
        ],
      })
    );

    expect(result.columns.map(c => c.index)).toEqual([1, 2]);
  });

  it('keeps an empty relationTypeIds when the model left them to the ontology', () => {
    // The healthy case. The prompt tells the model to omit these whenever the
    // search result carried real relationValueTypes, and apply re-hydrates and
    // prefers those — so empty here means "the ontology answered".
    const result = mapping(
      submission({
        columns: [{ index: 2, kind: 'relation', propertyId: FOUNDERS_PROP, propertyName: 'Founders' }],
      })
    );

    expect(result.columns.find(c => c.index === 2)).toMatchObject({ kind: 'relation', relationTypeIds: [] });
  });

  it('gives a skipped column a reason even when the model omitted one', () => {
    const result = mapping(submission({ columns: [{ index: 1, kind: 'skip' }] }));

    expect(result.columns.find(c => c.index === 1)).toMatchObject({ kind: 'skip', reason: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// Checking the model's answer against evidence we already hold.
//
// Everything above this line tests the *shape* of a submission — is the id
// well-formed, is the type one we showed it. These test the other half: the
// column's own `filled` count and samples travelled with the request, and a
// decision that contradicts them is not a judgement call worth honouring.
// Both directions failed in QA, on the same file: one run skipped a full
// column it had candidates for, the next mapped two columns it had been told
// were empty.
// ---------------------------------------------------------------------------

const { coercionFitsSamples, contestedSkips, mergeRevisions } = await import('./route');

const ROLE_PROP = 'e'.repeat(32);

function candidateMap(entries: Record<number, Array<{ id: string; name: string; dataType: string }>>) {
  return new Map(Object.entries(entries).map(([index, list]) => [Number(index), list]));
}

describe('coercionFitsSamples', () => {
  it('accepts a rule that reads at least one sample', () => {
    expect(coercionFitsSamples('integer:year', ['circa 2016', 'not a year'])).toBe(true);
  });

  it('rejects a rule that reads none of them', () => {
    // `integer` over a column of names: every row would coerce to nothing and
    // the property would land on every entity, set on none.
    expect(coercionFitsSamples('integer', ['Vitalik Buterin', 'Sam Altman'])).toBe(false);
  });

  it('accepts a column of placeholders', () => {
    // Nothing to disprove. `filled` is what catches a genuinely empty column.
    expect(coercionFitsSamples('integer', ['N/A', '-', 'unknown'])).toBe(true);
  });

  it('accepts text for anything', () => {
    expect(coercionFitsSamples('text', ['2015', 'whatever'])).toBe(true);
  });

  it('rejects a rule that is not one we implement', () => {
    expect(coercionFitsSamples('integer:quarter', ['Q1 2015'])).toBe(false);
  });
});

describe('contestedSkips', () => {
  const withCandidates = candidateMap({ 2: [{ id: ROLE_PROP, name: 'Roles', dataType: 'RELATION' }] });

  it('contests a skip on a column that had candidates and data', () => {
    const skipped = submission({ columns: [{ index: 2, kind: 'skip', reason: 'No matching property.' }] });
    const result = contestedSkips(skipped.columns, input(), withCandidates, 0);

    expect(result.map(c => c.index)).toEqual([2]);
  });

  it('lets a skip stand when nothing was found for the column', () => {
    // The reason is true here — there was genuinely nothing to see.
    const skipped = submission({ columns: [{ index: 2, kind: 'skip', reason: 'No matching property.' }] });

    expect(contestedSkips(skipped.columns, input(), new Map(), 0)).toEqual([]);
  });

  it('lets a skip stand on an empty column even with candidates', () => {
    const empty = input({
      columns: [
        { index: 0, header: 'Name', samples: ['Ethereum'], filled: 340 },
        { index: 2, header: 'Role', samples: [], filled: 0 },
      ],
    });
    const skipped = submission({ columns: [{ index: 2, kind: 'skip', reason: 'Column is empty.' }] });

    expect(contestedSkips(skipped.columns, empty, withCandidates, 0)).toEqual([]);
  });

  it('never contests the name column', () => {
    const skipped = submission({ nameColumn: 2, columns: [{ index: 2, kind: 'skip', reason: 'n/a' }] });

    expect(contestedSkips(skipped.columns, input(), withCandidates, 2)).toEqual([]);
  });

  it('does not contest a column that was mapped', () => {
    expect(contestedSkips(submission().columns, input(), withCandidates, 0)).toEqual([]);
  });
});

describe('mergeRevisions', () => {
  it('replaces only the columns that were reconsidered', () => {
    const merged = mergeRevisions(
      submission({
        columns: [
          { index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'text' },
          { index: 2, kind: 'skip', reason: 'No matching property.' },
        ],
      }),
      new Map([[2, { index: 2, kind: 'relation' as const, propertyId: ROLE_PROP, propertyName: 'Roles' }]])
    );

    expect(merged.columns).toEqual([
      { index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Website', coercion: 'text' },
      { index: 2, kind: 'relation', propertyId: ROLE_PROP, propertyName: 'Roles' },
    ]);
  });

  it('leaves the submission alone when nothing was revised', () => {
    const original = submission();

    expect(mergeRevisions(original, new Map())).toBe(original);
  });
});

describe('buildMapping against the column evidence', () => {
  const emptyColumn = input({
    columns: [
      { index: 0, header: 'Name', samples: ['Ethereum'], filled: 340 },
      { index: 1, header: 'YouTube', samples: [], filled: 0 },
    ],
  });

  it('skips a column the file says is empty, however good the property match', () => {
    // A run in QA mapped two `filled: 0` columns to real properties. Nothing
    // can be imported from them, and mapping them puts a property on every
    // entity with a value on none.
    const result = mapping(
      submission({
        columns: [{ index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'YouTube', coercion: 'text' }],
      }),
      emptyColumn
    );

    expect(result.columns.find(c => c.index === 1)).toMatchObject({ kind: 'skip', reason: 'Column is empty.' });
  });

  it('skips a value column whose rule cannot read any of its samples', () => {
    const result = mapping(
      submission({
        columns: [{ index: 2, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Founded', coercion: 'integer' }],
      })
    );

    expect(result.columns.find(c => c.index === 2)).toMatchObject({ kind: 'skip' });
  });

  it('keeps a value column whose rule reads its samples', () => {
    const founded = input({
      columns: [
        { index: 0, header: 'Name', samples: ['Ethereum'], filled: 340 },
        { index: 1, header: 'Founded', samples: ['circa 2015', 'unknown'], filled: 300 },
      ],
    });
    const result = mapping(
      submission({
        columns: [
          { index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'Founded', coercion: 'integer:year' },
        ],
      }),
      founded
    );

    expect(result.columns.find(c => c.index === 1)).toMatchObject({ kind: 'value', coercion: 'integer:year' });
  });

  it('marks a skip that had candidates, so the curator can overrule it', () => {
    const result = buildMapping(
      submission({ columns: [{ index: 2, kind: 'skip', reason: 'Did not fit.' }] }),
      input(),
      KNOWN_TYPES,
      candidateMap({ 2: [{ id: ROLE_PROP, name: 'Roles', dataType: 'RELATION' }] })
    );

    if ('error' in result) throw new Error('expected a mapping');
    expect(result.columns.find(c => c.index === 2)).toMatchObject({ kind: 'skip', hadCandidates: true });
  });

  it('does not mark an empty column reviewable, even when candidates exist', () => {
    // A blank `YouTube` column still matches the `YouTube` property. There is
    // nothing in it to import, so there is nothing for the curator to overrule.
    const result = buildMapping(
      submission({
        columns: [{ index: 1, kind: 'value', propertyId: WEBSITE_PROP, propertyName: 'YouTube', coercion: 'text' }],
      }),
      emptyColumn,
      KNOWN_TYPES,
      candidateMap({ 1: [{ id: WEBSITE_PROP, name: 'YouTube', dataType: 'TEXT' }] })
    );

    if ('error' in result) throw new Error('expected a mapping');
    expect(result.columns.find(c => c.index === 1)).not.toHaveProperty('hadCandidates');
  });

  it('leaves a skip unmarked when nothing was found for it', () => {
    const result = mapping(submission({ columns: [{ index: 2, kind: 'skip', reason: 'Nothing matched.' }] }));

    expect(result.columns.find(c => c.index === 2)).not.toHaveProperty('hadCandidates');
  });
});

describe('buildMapping and the relation split rule', () => {
  function relationWith(split?: string) {
    return mapping(
      submission({
        columns: [
          {
            index: 2,
            kind: 'relation',
            propertyId: FOUNDERS_PROP,
            propertyName: 'Founders',
            relationTypeIds: [],
            split,
          },
        ],
      })
    ).columns.find(c => c.index === 2);
  }

  it('defaults to list, which is what the engine did before the rule existed', () => {
    expect(relationWith()).toMatchObject({ kind: 'relation', split: 'list' });
  });

  it('carries a rule the model chose', () => {
    expect(relationWith('slash')).toMatchObject({ split: 'slash' });
    expect(relationWith('none')).toMatchObject({ split: 'none' });
  });

  it('falls back to list rather than failing the column on a bad rule', () => {
    expect(relationWith('semicolons-only')).toMatchObject({ split: 'list' });
  });
});
