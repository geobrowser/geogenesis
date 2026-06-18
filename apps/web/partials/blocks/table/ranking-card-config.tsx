'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { Source } from '~/core/blocks/data/source';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import type { Property } from '~/core/types';

const RANKING_CARD_EXCLUDED_PROPERTY_IDS = new Set<string>([
  SystemIds.NAME_PROPERTY,
  SystemIds.DESCRIPTION_PROPERTY,
  SystemIds.COVER_PROPERTY,
  ContentIds.AVATAR_PROPERTY,
]);

export type RankingCardConfig = {
  properties: Property[];
  source: Source;
};

export function selectRankingCardProperties(properties: Property[]): Property[] {
  return properties.filter(property => !RANKING_CARD_EXCLUDED_PROPERTY_IDS.has(property.id));
}

const RankingCardConfigContext = React.createContext<RankingCardConfig>({ properties: [], source: { type: 'GEO' } });

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

export function useRankingShownProperties() {
  const {
    properties,
    shownColumnIds,
    filterableProperties,
    orderedShownColumnRelations,
    toggleProperty,
    hideAllShownPropertyColumns,
    reorderShownPropertyRelations,
    source,
  } = useDataBlock();

  const cardProperties = React.useMemo(() => selectRankingCardProperties(properties), [properties]);

  const cardConfig = React.useMemo<RankingCardConfig>(
    () => ({ properties: cardProperties, source }),
    [cardProperties, source]
  );

  const menuProps = React.useMemo(
    () => ({
      sourceType: source.type,
      filterableProperties,
      shownColumnIds,
      orderedShownColumnRelations,
      toggleProperty,
      hideAllShownPropertyColumns,
      reorderShownPropertyRelations,
    }),
    [
      source.type,
      filterableProperties,
      shownColumnIds,
      orderedShownColumnRelations,
      toggleProperty,
      hideAllShownPropertyColumns,
      reorderShownPropertyRelations,
    ]
  );

  return { cardConfig, menuProps };
}
