import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { buildColumnMapping, buildSplitRules, coerceTable, fillMissingRelationTypes } from './apply';
import type { ImportMapping } from './mapping-types';
import type { ParsedTable } from './types';

const WEBSITE = 'c'.repeat(32);
const FOUNDED = 'e'.repeat(32);
const FOUNDERS = 'd'.repeat(32);
const PERSON = 'b'.repeat(32);
const PROJECT = 'a'.repeat(32);

function table(headers: string[], rows: string[][]): ParsedTable {
  return { headers, rows, rowCount: rows.length };
}

function mapping(overrides: Partial<ImportMapping> = {}): ImportMapping {
  return {
    typeId: PROJECT,
    typeName: 'Project',
    nameColumn: 0,
    summary: 'ok',
    columns: [
      { index: 1, kind: 'value', propertyId: WEBSITE, propertyName: 'Website', coercion: 'text' },
      { index: 2, kind: 'value', propertyId: FOUNDED, propertyName: 'Founding year', coercion: 'integer:year' },
    ],
    ...overrides,
  };
}

describe('coerceTable', () => {
  it('converts value columns in place and leaves other columns alone', () => {
    const { rows } = coerceTable(
      table(
        ['Name', 'URL', 'Founded'],
        [
          ['Ethereum', 'https://ethereum.org', 'March 2015'],
          ['Polkadot', 'https://polkadot.network', 'circa 2020'],
        ]
      ),
      mapping()
    );

    expect(rows[0]).toEqual(['Ethereum', 'https://ethereum.org', '2015']);
    expect(rows[1]).toEqual(['Polkadot', 'https://polkadot.network', '2020']);
  });

  it('blanks a cell it cannot convert, which is how the engine writes no value', () => {
    // The whole chain: unconvertible → '' → buildGeneratedRows does
    // `if (!raw) continue` → no Value emitted → publish never sees it → no `0`.
    const { rows, reports } = coerceTable(
      table(['Name', 'URL', 'Founded'], [['Ethereum', 'https://ethereum.org', 'sometime in the 90s']]),
      mapping()
    );

    expect(rows[0][2]).toBe('');
    expect(reports.get(2)).toMatchObject({ unconvertible: 1, converted: 0 });
  });

  it('blanks a placeholder and counts it separately from a failure', () => {
    const { rows, reports } = coerceTable(
      table(
        ['Name', 'URL', 'Founded'],
        [
          ['Ethereum', 'https://ethereum.org', 'N/A'],
          ['Polkadot', 'https://polkadot.network', 'nonsense'],
        ]
      ),
      mapping()
    );

    expect(rows[0][2]).toBe('');
    expect(rows[1][2]).toBe('');
    expect(reports.get(2)).toMatchObject({ placeholder: 1, unconvertible: 1 });
  });

  it('does not touch the name column', () => {
    const { rows } = coerceTable(
      table(['Name', 'URL', 'Founded'], [['N/A Industries', 'https://x.org', '2015']]),
      mapping()
    );

    expect(rows[0][0]).toBe('N/A Industries');
  });

  it('does not touch a skipped column', () => {
    const { rows } = coerceTable(
      table(['Name', 'Ref'], [['Ethereum', 'INTERNAL-123']]),
      mapping({ columns: [{ index: 1, kind: 'skip', reason: 'no property' }] })
    );

    expect(rows[0][1]).toBe('INTERNAL-123');
  });

  it('does not touch a relation column — those are resolved, not converted', () => {
    const { rows } = coerceTable(
      table(['Name', 'Founders'], [['Ethereum', 'Vitalik Buterin']]),
      mapping({
        columns: [
          { index: 1, kind: 'relation', propertyId: FOUNDERS, propertyName: 'Founders', relationTypeIds: [PERSON] },
        ],
      })
    );

    expect(rows[0][1]).toBe('Vitalik Buterin');
  });

  it('leaves an already-empty cell out of the tallies', () => {
    const { reports } = coerceTable(table(['Name', 'URL', 'Founded'], [['Ethereum', '', '']]), mapping());

    expect(reports.get(2)).toMatchObject({ converted: 0, placeholder: 0, unconvertible: 0 });
  });

  it('does not mutate the original table', () => {
    const original = table(['Name', 'URL', 'Founded'], [['Ethereum', 'https://e.org', 'March 2015']]);

    coerceTable(original, mapping());

    expect(original.rows[0][2]).toBe('March 2015');
  });
});

describe('buildColumnMapping', () => {
  it('maps the name column to the Name property', () => {
    // The engine writes the entity name from whatever column is mapped to
    // NAME_PROPERTY, so this is not optional bookkeeping.
    expect(buildColumnMapping(mapping())[0]).toBe(SystemIds.NAME_PROPERTY);
  });

  it('maps value and relation columns to their properties', () => {
    const result = buildColumnMapping(mapping());

    expect(result[1]).toBe(WEBSITE);
    expect(result[2]).toBe(FOUNDED);
  });

  it('leaves skipped columns out entirely', () => {
    const result = buildColumnMapping(mapping({ columns: [{ index: 1, kind: 'skip', reason: 'no property' }] }));

    expect(result).not.toHaveProperty('1');
  });
});

describe('fillMissingRelationTypes', () => {
  it('fills in types when the ontology gave none', () => {
    // The fix. Empty typeIds makes the resolver's filter a no-op, and it falls
    // back to whichever namesake has the most links — a Project called "Elon
    // Musk" beating the person.
    const relationProperties = [{ propertyId: FOUNDERS, typeIds: [] as string[] }];

    const { filled } = fillMissingRelationTypes(
      relationProperties,
      mapping({
        columns: [
          { index: 1, kind: 'relation', propertyId: FOUNDERS, propertyName: 'Founders', relationTypeIds: [PERSON] },
        ],
      })
    );

    expect(relationProperties[0].typeIds).toEqual([PERSON]);
    expect(filled).toBe(1);
  });

  it('never overrides types the ontology did declare', () => {
    // Hydration is the truth. The model's reading is a fallback for properties
    // nobody declared, and must not win against a real declaration.
    const relationProperties = [{ propertyId: FOUNDERS, typeIds: ['f'.repeat(32)] }];

    const { filled } = fillMissingRelationTypes(
      relationProperties,
      mapping({
        columns: [
          { index: 1, kind: 'relation', propertyId: FOUNDERS, propertyName: 'Founders', relationTypeIds: [PERSON] },
        ],
      })
    );

    expect(relationProperties[0].typeIds).toEqual(['f'.repeat(32)]);
    expect(filled).toBe(0);
  });

  it('leaves types empty when the model also had nothing', () => {
    // Better an unfiltered search than a filter on a type the column isn't.
    const relationProperties = [{ propertyId: FOUNDERS, typeIds: [] as string[] }];

    const { filled } = fillMissingRelationTypes(
      relationProperties,
      mapping({
        columns: [{ index: 1, kind: 'relation', propertyId: FOUNDERS, propertyName: 'Founders', relationTypeIds: [] }],
      })
    );

    expect(relationProperties[0].typeIds).toEqual([]);
    expect(filled).toBe(0);
  });

  it('ignores relation properties the mapping never mentioned', () => {
    const relationProperties = [{ propertyId: 'aa'.repeat(16), typeIds: [] as string[] }];

    const { filled } = fillMissingRelationTypes(relationProperties, mapping());

    expect(filled).toBe(0);
  });
});

describe('buildSplitRules', () => {
  const withColumns = (columns: ImportMapping['columns']): ImportMapping => ({
    typeId: 'a'.repeat(32),
    typeName: 'Person',
    nameColumn: 0,
    columns,
    summary: 's',
  });

  it('collects the rule from every relation column that carries one', () => {
    const rules = buildSplitRules(
      withColumns([
        { index: 1, kind: 'relation', propertyId: 'p1', propertyName: 'Roles', relationTypeIds: [], split: 'slash' },
        { index: 2, kind: 'relation', propertyId: 'p2', propertyName: 'Born in', relationTypeIds: [], split: 'none' },
      ])
    );

    expect(rules).toEqual({ 1: 'slash', 2: 'none' });
  });

  it('leaves a column out when no rule was chosen, so the engine defaults', () => {
    // A mapping stored before the rule existed has no `split`, and must keep
    // behaving exactly as it did.
    const rules = buildSplitRules(
      withColumns([{ index: 1, kind: 'relation', propertyId: 'p1', propertyName: 'Founders', relationTypeIds: [] }])
    );

    expect(rules).toEqual({});
  });

  it('ignores value and skipped columns', () => {
    const rules = buildSplitRules(
      withColumns([
        { index: 1, kind: 'value', propertyId: 'p1', propertyName: 'Website', coercion: 'text' },
        { index: 2, kind: 'skip', reason: 'Nothing matched.' },
      ])
    );

    expect(rules).toEqual({});
  });
});
