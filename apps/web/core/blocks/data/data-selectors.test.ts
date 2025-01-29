import { describe, expect, it } from 'vitest';

import { parseSelectorIntoLexicon } from './data-selectors';

describe('data-selectors', () => {
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
        entity: 'ToId',
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
        entity: 'ToId',
        type: 'RELATION',
      },
      {
        entity: 'CoverId',
        type: 'RELATION',
      },
    ]);
  });

  it('->[Roles].[Name]', () => {
    const result = parseSelectorIntoLexicon('->[Roles].[Name]');

    expect(result).toEqual([
      {
        entity: 'Roles',
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
        entity: 'Roles',
        type: 'RELATION',
      },
      {
        entity: 'ToId',
        type: 'RELATION',
      },
      {
        property: 'NameId',
        type: 'TRIPLE',
      },
    ]);
  });
});
