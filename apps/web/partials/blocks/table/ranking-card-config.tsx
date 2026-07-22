'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { Source } from '~/core/blocks/data/source';
import { ID } from '~/core/id';
import type { Property } from '~/core/types';

/**
 * Normalized so membership matches `ID.equals` semantics
 */
const RANKING_CARD_EXCLUDED_PROPERTY_IDS = new Set<string>(
  [SystemIds.NAME_PROPERTY, SystemIds.DESCRIPTION_PROPERTY, SystemIds.COVER_PROPERTY, ContentIds.AVATAR_PROPERTY].map(
    id => ID.uuidToHex(id)
  )
);

export type RankingCardImageProperty = 'avatar' | 'cover';

export type RankingCardConfig = {
  properties: Property[];
  source: Source;
  imageProperty: RankingCardImageProperty;
};

export function selectRankingCardProperties(properties: Property[]): Property[] {
  return properties.filter(property => !RANKING_CARD_EXCLUDED_PROPERTY_IDS.has(ID.uuidToHex(property.id)));
}

export function selectRankingCardImageProperty(shownColumnIds: string[]): RankingCardImageProperty {
  return shownColumnIds.some(id => ID.equals(id, SystemIds.COVER_PROPERTY)) ? 'cover' : 'avatar';
}

/**
 * Single definition of a ranking card's config. Callers already hold the data block fields
 */
export function buildRankingCardConfig({
  properties,
  shownColumnIds,
  source,
}: {
  properties: Property[];
  shownColumnIds: string[];
  source: Source;
}): RankingCardConfig {
  return {
    properties: selectRankingCardProperties(properties),
    source,
    imageProperty: selectRankingCardImageProperty(shownColumnIds),
  };
}

const RankingCardConfigContext = React.createContext<RankingCardConfig>({
  properties: [],
  source: { type: 'GEO' },
  imageProperty: 'avatar',
});

export function RankingCardConfigProvider({
  value,
  children,
}: {
  value: RankingCardConfig;
  children: React.ReactNode;
}) {
  return <RankingCardConfigContext.Provider value={value}>{children}</RankingCardConfigContext.Provider>;
}

export function useRankingCardConfig(): RankingCardConfig {
  return React.useContext(RankingCardConfigContext);
}
