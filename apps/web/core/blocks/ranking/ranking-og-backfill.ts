import {
  RANKING_OG_VARIANTS,
  type RankingOgVariant,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  isRankingOgVariant,
} from './ranking-og-storage';

export type RankingOgBackfillInput = {
  rankEntityId: string;
  authorSpaceId: string;
  blockEntityId: string;
  blockEntitySpaceId: string;
  ogVersion: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

export type RankingOgBackfillPlanItem = RankingOgBackfillInput & {
  variant: RankingOgVariant;
  key: string;
  imageUrl: string;
};

export function parseRankingOgVariants(raw?: string): RankingOgVariant[] {
  if (!raw) return [...RANKING_OG_VARIANTS];
  const variants = raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (variants.length === 0 || !variants.every(isRankingOgVariant)) {
    throw new Error(`Invalid variants: ${raw}`);
  }
  return [...new Set(variants)];
}

export function buildRankingOgBackfillPlan({
  inputs,
  publicBaseUrl,
  variants = [...RANKING_OG_VARIANTS],
}: {
  inputs: RankingOgBackfillInput[];
  publicBaseUrl: string;
  variants?: RankingOgVariant[];
}): RankingOgBackfillPlanItem[] {
  const seen = new Set<string>();
  const items: RankingOgBackfillPlanItem[] = [];

  for (const input of inputs) {
    for (const variant of variants) {
      const dedupeKey = `${input.rankEntityId}:${input.ogVersion}:${variant}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const key = buildRankingOgObjectKey({
        rankEntityId: input.rankEntityId,
        version: input.ogVersion,
        variant,
      });
      items.push({
        ...input,
        variant,
        key,
        imageUrl: buildRankingOgPublicUrl(publicBaseUrl, key),
      });
    }
  }

  return items;
}
