import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Property } from '~/core/types';

import {
  buildRankingCardConfig,
  selectRankingCardImageProperty,
  selectRankingCardProperties,
} from './ranking-card-config';

function prop(id: string, name: string | null = null): Property {
  return { id, name, dataType: 'RELATION' };
}

function dashed(id: string): string {
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-');
}

describe('selectRankingCardProperties', () => {
  const custom = prop('custom-prop', 'Custom');

  it('drops name, description, cover and avatar', () => {
    const properties = [
      prop(SystemIds.NAME_PROPERTY),
      prop(SystemIds.DESCRIPTION_PROPERTY),
      prop(SystemIds.COVER_PROPERTY),
      prop(ContentIds.AVATAR_PROPERTY),
      custom,
    ];

    expect(selectRankingCardProperties(properties)).toEqual([custom]);
  });

  it('drops excluded properties whose ids arrive dashed', () => {
    const properties = [prop(dashed(SystemIds.COVER_PROPERTY)), prop(dashed(ContentIds.AVATAR_PROPERTY)), custom];

    expect(selectRankingCardProperties(properties)).toEqual([custom]);
  });
});

describe('selectRankingCardImageProperty', () => {
  it('prefers cover when the cover column is shown', () => {
    expect(selectRankingCardImageProperty([SystemIds.COVER_PROPERTY])).toBe('cover');
    expect(selectRankingCardImageProperty([dashed(SystemIds.COVER_PROPERTY)])).toBe('cover');
  });

  it('falls back to avatar otherwise', () => {
    expect(selectRankingCardImageProperty([ContentIds.AVATAR_PROPERTY])).toBe('avatar');
    expect(selectRankingCardImageProperty([])).toBe('avatar');
  });
});

describe('selector agreement', () => {
  it.each([SystemIds.COVER_PROPERTY, dashed(SystemIds.COVER_PROPERTY)])('cover id %s is never both', coverId => {
    expect(selectRankingCardImageProperty([coverId])).toBe('cover');
    expect(selectRankingCardProperties([prop(coverId)])).toEqual([]);
  });
});

describe('buildRankingCardConfig', () => {
  const source = { type: 'GEO' } as const;
  const custom = prop('custom-prop', 'Custom');

  it('applies both selectors and passes source through', () => {
    expect(
      buildRankingCardConfig({
        properties: [prop(SystemIds.COVER_PROPERTY), custom],
        shownColumnIds: [SystemIds.COVER_PROPERTY, custom.id],
        source,
      })
    ).toEqual({ properties: [custom], source, imageProperty: 'cover' });
  });

  it('falls back to avatar when no cover column is shown', () => {
    expect(buildRankingCardConfig({ properties: [custom], shownColumnIds: [custom.id], source }).imageProperty).toBe(
      'avatar'
    );
  });

  it.each([SystemIds.COVER_PROPERTY, dashed(SystemIds.COVER_PROPERTY)])(
    'never emits the image property as a field (%s)',
    coverId => {
      const config = buildRankingCardConfig({
        properties: [prop(coverId), custom],
        shownColumnIds: [coverId, custom.id],
        source,
      });

      expect(config.imageProperty).toBe('cover');
      expect(config.properties).toEqual([custom]);
    }
  );
});
