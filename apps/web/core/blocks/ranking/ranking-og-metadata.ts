import type { Metadata } from 'next';

import {
  type GlobalRankingOgPreviewParams,
  type PersonalRankingOgPreviewParams,
  buildRankingOgPreviewUrl,
} from './ranking-og-preview-url';
import {
  RANKING_OG_VARIANT_SIZES,
  buildGlobalRankingOgObjectKey,
  buildRankingOgObjectKey,
  buildRankingOgPublicUrl,
  getRankingOgPublicBaseUrl,
  getRankingOgStorageConfig,
  isRankingOgStorageConfigured,
  rankingOgObjectExists,
} from './ranking-og-storage';
import { formatSharedRankingOwnerLabel } from './ranking-owner-label';
import type { ResolvedGlobalRankingShare, ResolvedPersonalRankingShare } from './resolve-ranking-share';

type PersonalMetadataParts = {
  rankingName: string;
  authorName: string;
  imageUrl: string;
  /** Absolute canonical URL the social card should point at. */
  url: string;
};

type GlobalMetadataParts = {
  rankingName: string;
  imageUrl: string;
  url: string;
};

type PersonalRankingOgImageUrlParams = Omit<PersonalRankingOgPreviewParams, 'scope'> & {
  ogVersion: string;
};

type GlobalRankingOgImageUrlParams = Omit<GlobalRankingOgPreviewParams, 'scope'> & {
  globalOgVersion: string;
};

/**
 * Pure assembly of the personal ranking social card metadata. Shared by the long
 * `ranking-compose` route (which computes `imageUrl` from pinned search params)
 * and the short `/r/{rankEntityId}` route (which computes it from the resolver).
 */
export function buildPersonalRankingMetadataFromParts({
  rankingName,
  authorName,
  imageUrl,
  url,
}: PersonalMetadataParts): Metadata {
  const name = rankingName || 'ranking';
  const trimmedAuthor = authorName.trim();
  const shareTitle = trimmedAuthor ? formatSharedRankingOwnerLabel(trimmedAuthor) : `My ${name}`;
  const description = trimmedAuthor ? `${shareTitle} for ${name}.` : `A personal Geo ranking for ${name}.`;

  return {
    title: name,
    description,
    openGraph: {
      title: shareTitle,
      description,
      url,
      images: [
        {
          url: imageUrl,
          ...RANKING_OG_VARIANT_SIZES.landscape,
          alt: shareTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: [imageUrl],
    },
  };
}

/** Pure assembly of the global ranking social card metadata. */
export function buildGlobalRankingMetadataFromParts({ rankingName, imageUrl, url }: GlobalMetadataParts): Metadata {
  const name = rankingName || 'ranking';
  const description = `Vote on the global Geo ranking for ${name}.`;

  return {
    title: name,
    description,
    openGraph: {
      title: name,
      description,
      url,
      images: [
        {
          url: imageUrl,
          ...RANKING_OG_VARIANT_SIZES.landscape,
          alt: name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
      images: [imageUrl],
    },
  };
}

/**
 * R2-first with preview fallback: serve the pre-generated static R2 object when it
 * exists for the (recomputed) version, otherwise fall back to the live preview
 * render so the card is always correct even when the ranking changed since publish.
 */
async function rankingOgObjectExistsSafe(key: string): Promise<boolean> {
  try {
    if (!isRankingOgStorageConfigured()) return false;
    return await rankingOgObjectExists(getRankingOgStorageConfig(), key);
  } catch {
    return false;
  }
}

export async function resolvePersonalRankingOgImageUrl(
  siteOrigin: string,
  params: PersonalRankingOgImageUrlParams
): Promise<string> {
  const publicBaseUrl = getRankingOgPublicBaseUrl();
  if (publicBaseUrl) {
    const key = buildRankingOgObjectKey({
      rankEntityId: params.rankEntityId,
      version: params.ogVersion,
      variant: 'landscape',
    });
    if (await rankingOgObjectExistsSafe(key)) {
      return buildRankingOgPublicUrl(publicBaseUrl, key);
    }
  }

  return buildRankingOgPreviewUrl(siteOrigin, { scope: 'personal', ...params });
}

export async function resolveGlobalRankingOgImageUrl(
  siteOrigin: string,
  params: GlobalRankingOgImageUrlParams
): Promise<string> {
  const publicBaseUrl = getRankingOgPublicBaseUrl();
  if (publicBaseUrl) {
    const key = buildGlobalRankingOgObjectKey({
      blockEntityId: params.blockEntityId,
      version: params.globalOgVersion,
      variant: 'landscape',
    });
    if (await rankingOgObjectExistsSafe(key)) {
      return buildRankingOgPublicUrl(publicBaseUrl, key);
    }
  }

  return buildRankingOgPreviewUrl(siteOrigin, { scope: 'global', ...params });
}

export async function buildPersonalRankingMetadata(
  resolved: ResolvedPersonalRankingShare,
  siteUrl: URL,
  canonicalUrl: string
): Promise<Metadata> {
  const imageUrl = await resolvePersonalRankingOgImageUrl(siteUrl.toString(), {
    rankEntityId: resolved.rankEntityId,
    authorSpaceId: resolved.authorSpaceId,
    blockEntityId: resolved.blockEntityId,
    blockEntitySpaceId: resolved.blockEntitySpaceId,
    rankingStartDate: resolved.rankingStartDate,
    rankingEndDate: resolved.rankingEndDate,
    ogVersion: resolved.ogVersion,
  });

  return buildPersonalRankingMetadataFromParts({
    rankingName: resolved.rankingName,
    authorName: resolved.authorName,
    imageUrl,
    url: new URL(canonicalUrl, siteUrl).toString(),
  });
}

export async function buildGlobalRankingMetadata(
  resolved: ResolvedGlobalRankingShare,
  siteUrl: URL,
  canonicalUrl: string
): Promise<Metadata> {
  const imageUrl = await resolveGlobalRankingOgImageUrl(siteUrl.toString(), {
    blockEntityId: resolved.blockEntityId,
    blockEntitySpaceId: resolved.blockEntitySpaceId,
    rankingStartDate: resolved.rankingStartDate,
    rankingEndDate: resolved.rankingEndDate,
    globalOgVersion: resolved.globalOgVersion,
  });

  return buildGlobalRankingMetadataFromParts({
    rankingName: resolved.rankingName,
    imageUrl,
    url: new URL(canonicalUrl, siteUrl).toString(),
  });
}
