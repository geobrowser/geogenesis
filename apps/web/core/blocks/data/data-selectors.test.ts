import { SYSTEM_IDS } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import { Triple } from '~/core/database/Triple';
import { EntityId } from '~/core/io/schema';

import { mapDataSelectorLexiconToData, parseSelectorIntoLexicon } from './data-selectors';
import { RelationRow } from './queries';

describe('parseSelectorIntoLexicon', () => {
  it('.[AttributeId]', () => {
    const result = parseSelectorIntoLexicon('.[NameId]');

    expect(result).toEqual([
      {
        property: 'NameId',
        type: 'TRIPLE',
      },
    ]);
  });

  it('->[ToId].[NameId]', () => {
    const result = parseSelectorIntoLexicon('->[ToId].[NameId]');

    expect(result).toEqual([
      {
        property: 'ToId',
        type: 'RELATION',
      },
      {
        property: 'NameId',
        type: 'TRIPLE',
      },
    ]);
  });

  it('->[ToId]->[CoverId]', () => {
    const result = parseSelectorIntoLexicon('->[ToId]->[CoverId]');

    expect(result).toEqual([
      {
        property: 'ToId',
        type: 'RELATION',
      },
      {
        property: 'CoverId',
        type: 'RELATION',
      },
    ]);
  });

  it('->[Roles].[Name]', () => {
    const result = parseSelectorIntoLexicon('->[Roles].[Name]');

    expect(result).toEqual([
      {
        property: 'Roles',
        type: 'RELATION',
      },
      {
        property: 'Name',
        type: 'TRIPLE',
      },
    ]);
  });

  it('->[Roles]->[ToId].[NameId]', () => {
    const result = parseSelectorIntoLexicon('->[Roles]->[ToId].[NameId]');

    expect(result).toEqual([
      {
        property: 'Roles',
        type: 'RELATION',
      },
      {
        property: 'ToId',
        type: 'RELATION',
      },
      {
        property: 'NameId',
        type: 'TRIPLE',
      },
    ]);
  });
});

describe.only('mapDataSelectorLexiconToData', () => {
  it('.[PropertyId]', () => {
    const input: RelationRow = {
      this: {
        id: EntityId('this'),
        name: 'this',
        triples: [
          Triple.make({
            attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
            attributeName: null,
            entityId: 'this',
            entityName: 'this',
            space: 'space',
            value: {
              type: 'TEXT',
              value: 'value',
            },
          }),
        ],
        description: null,
        types: [],
        nameTripleSpaces: [],
        relationsOut: [],
        spaces: [],
      },
      to: {
        id: EntityId('to'),
        name: 'to',
        triples: [],
        description: null,
        types: [],
        nameTripleSpaces: [],
        relationsOut: [],
        spaces: [],
      },
    };

    const lex = parseSelectorIntoLexicon(`.[${SYSTEM_IDS.NAME_ATTRIBUTE}]`);
    const data = mapDataSelectorLexiconToData(lex, input);
    expect(data).toEqual({
      propertyId: SYSTEM_IDS.NAME_ATTRIBUTE,
      value: 'value',
    });
  });
});
