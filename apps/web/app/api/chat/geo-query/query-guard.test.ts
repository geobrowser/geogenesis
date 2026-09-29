import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SIZE, MAX_ESTIMATED_NODES, checkQuery } from './query-guard';

const SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const TYPE = '937b2d16d9394adfa1bf97f58b7a5ec6';

function ok(query: string, variables?: Record<string, unknown>): number {
  const result = checkQuery(query, variables);
  if (!result.ok) throw new Error(`expected to pass, got: ${result.error}`);
  return result.estimatedNodes;
}

function rejected(query: string, variables?: Record<string, unknown>): string {
  const result = checkQuery(query, variables);
  if (result.ok) throw new Error(`expected a rejection, estimated ${result.estimatedNodes}`);
  return result.error;
}

describe('checkQuery — the shapes the skill recommends pass', () => {
  it('lets the cheapest query through: a count with no rows', () => {
    expect(ok(`{ entitiesConnection(spaceId: "${SPACE}", first: 0) { totalCount } }`)).toBe(0);
  });

  it('lets a small typed page with a filtered nested list through', () => {
    const estimated = ok(`{
      entities(typeId: "${TYPE}", spaceId: "${SPACE}", first: 100) {
        id name
        relations(filter: { typeId: { is: "${TYPE}" } }, first: 20) { nodes { type { name } toEntity { id name } } }
      }
    }`);
    expect(estimated).toBeLessThan(MAX_ESTIMATED_NODES);
  });

  it('lets the flat bulk scan through: 1,000 relations with their endpoints inlined', () => {
    const estimated = ok(`{
      relationsConnection(filter: { spaceId: { is: "${SPACE}" } }, first: 1000) {
        nodes { id type { id name } fromEntity { id name } toEntity { id name } entity { id name } }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    expect(estimated).toBeGreaterThan(1000);
    expect(estimated).toBeLessThan(MAX_ESTIMATED_NODES);
  });

  it('lets a large cursor page of plain fields through', () => {
    ok(
      `{ entitiesConnection(typeId: "${TYPE}", first: 500) { nodes { id name types { id name } } pageInfo { hasNextPage endCursor } } }`
    );
  });

  it('reads a page size bound through variables', () => {
    expect(ok(`query ($n: Int!) { entities(spaceId: "${SPACE}", first: $n) { id } }`, { n: 7 })).toBe(7);
  });
});

describe('checkQuery — the documented incident shape is refused', () => {
  it('refuses a large root page that hydrates unfiltered relations per row', () => {
    const error = rejected(`{
      entitiesConnection(typeId: "${TYPE}", first: 1000) {
        nodes { id name relations(first: 1000) { nodes { type { name } toEntity { name } } } }
      }
    }`);
    expect(error).toContain('1000 rows');
    expect(error).toContain('relations(first: 1000)');
    expect(error).toContain('filter');
  });

  it('refuses a large root page nesting a list even when that list is filtered', () => {
    const error = rejected(`{
      entities(typeId: "${TYPE}", first: 500) {
        id relations(filter: { typeId: { is: "${TYPE}" } }, first: 5) { nodes { id } }
      }
    }`);
    expect(error).toContain('500 rows');
  });

  it('assumes the API default page for a nested list with no first', () => {
    const estimated = ok(`{ entities(typeId: "${TYPE}", first: 10) { id relations { nodes { id } } } }`);
    expect(estimated).toBe(10 * (1 + DEFAULT_PAGE_SIZE * 2));
  });

  it('refuses by estimate when moderate pages multiply past the ceiling', () => {
    const error = rejected(`{
      entities(typeId: "${TYPE}", first: 100) {
        id values(first: 100) { nodes { id property { name } entity { id } } }
      }
    }`);
    expect(error).toContain('over the 25,000 allowed');
  });

  it('refuses a document that nests too deep', () => {
    const deep = Array.from({ length: 12 }, () => 'relations(first: 1) { nodes { ').join('') + 'id' + ' } }'.repeat(12);
    expect(rejected(`{ entities(first: 1) { ${deep} } }`)).toContain('levels deep');
  });
});

describe('checkQuery — documents it will not forward', () => {
  it('reports a syntax error instead of sending it', () => {
    expect(rejected('{ entities(first: 1) { id ')).toContain('syntax error');
  });

  it('refuses anything but a read query', () => {
    expect(rejected('mutation { deleteEverything }')).toContain('Only read queries');
  });

  it('refuses fragments, spread or defined', () => {
    expect(rejected(`{ entities(first: 1) { ...Fields } } fragment Fields on Entity { id }`)).toContain('Fragments');
  });

  it('refuses more than one operation per call', () => {
    expect(rejected('query A { entities(first: 1) { id } } query B { entities(first: 1) { id } }')).toContain(
      'exactly one'
    );
  });
});
