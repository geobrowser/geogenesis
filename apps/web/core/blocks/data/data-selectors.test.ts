import { SystemIds } from '@geoprotocol/geo-sdk';
import { describe, expect, it } from 'vitest';

import { generateSelector, parseSelectorIntoLexicon } from './data-selectors';

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

describe('generateSelector', () => {
  it('TO entity with triple', () => {
    const selector = generateSelector(
      {
        id: '1',
        renderableType: 'TEXT',
      },
      'TO'
    );

    expect(selector).toEqual(`->[${SystemIds.RELATION_TO_PROPERTY}]->.[1]`);

    // Name triple's default to the entity itself rather than its name
    const nameSelector = generateSelector(
      {
        id: SystemIds.NAME_PROPERTY,
        renderableType: 'TEXT',
      },
      'TO'
    );

    expect(nameSelector).toEqual(`->[${SystemIds.RELATION_TO_PROPERTY}]`);
  });

  it('TO entity with relation', () => {
    const selector = generateSelector(
      {
        id: '1',
        renderableType: 'RELATION',
      },
      'TO'
    );

    expect(selector).toEqual(`->[${SystemIds.RELATION_TO_PROPERTY}]->[1]->[${SystemIds.RELATION_TO_PROPERTY}]`);
  });

  it('FROM entity with triple', () => {
    const selector = generateSelector(
      {
        id: '1',
        renderableType: 'TEXT',
      },
      'FROM'
    );

    expect(selector).toEqual(`->[${SystemIds.RELATION_FROM_PROPERTY}]->.[1]`);

    // Name triple's default to the entity itself rather than its name
    const nameSelector = generateSelector(
      {
        id: SystemIds.NAME_PROPERTY,
        renderableType: 'TEXT',
      },
      'FROM'
    );

    expect(nameSelector).toEqual(`->[${SystemIds.RELATION_FROM_PROPERTY}]`);
  });

  it('FROM entity with relation', () => {
    const selector = generateSelector(
      {
        id: '1',
        renderableType: 'RELATION',
      },
      'FROM'
    );

    expect(selector).toEqual(`->[${SystemIds.RELATION_FROM_PROPERTY}]->[1]->[${SystemIds.RELATION_TO_PROPERTY}]`);
  });

  it('SOURCE entity with name', () => {
    const selector = generateSelector(
      {
        id: '1',
        renderableType: 'TEXT',
      },
      'SOURCE'
    );

    expect(selector).toEqual(`.[1]`);
  });

  it('SOURCE entity with relation', () => {
    const selector = generateSelector(
      {
        id: '1',
        renderableType: 'RELATION',
      },
      'SOURCE'
    );

    expect(selector).toEqual(`->[1]->[${SystemIds.RELATION_TO_PROPERTY}]`);
  });
});
