import { describe, expect, it } from 'vitest';

import { parseSelectorIntoLexicon } from './data-selectors';

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

  // @TODO: How do we select this an image?
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
