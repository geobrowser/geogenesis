import { describe, expect, it } from 'vitest';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import type { Property } from '~/core/types';

import { mergeBlockMenuProperties } from './merge-block-menu-properties';

describe('mergeBlockMenuProperties', () => {
  it('puts Description, Types, and Score first after schema merge', () => {
    const schema: Property[] = [
      { id: 'custom-prop', name: 'Custom', dataType: 'TEXT' },
      { id: SystemIds.TYPES_PROPERTY, name: 'Types', dataType: 'RELATION' },
    ];

    const merged = mergeBlockMenuProperties(schema);

    expect(merged.map(p => p.id)).toEqual([
      SystemIds.DESCRIPTION_PROPERTY,
      SystemIds.TYPES_PROPERTY,
      SCORE_SYSTEM_PROPERTY,
      'custom-prop',
    ]);
  });

  it('includes Score even when the schema never defines it', () => {
    const merged = mergeBlockMenuProperties([]);
    expect(merged.some(p => p.id === SCORE_SYSTEM_PROPERTY)).toBe(true);
    expect(merged.find(p => p.id === SCORE_SYSTEM_PROPERTY)?.name).toBe('Score');
  });
});
