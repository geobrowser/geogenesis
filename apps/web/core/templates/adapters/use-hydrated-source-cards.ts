'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { NEWS_STORY_TYPE_ID } from '~/core/constants';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { X_PROPERTY } from '~/core/profile/profile-links';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type { EntityLinkKind, EntityLinkRowModel, SourceMediaKind } from '../models';
import {
  TEMPLATE_ONTOLOGY,
  formatOntologyDate,
  handleFromSocialUrl,
  publicationFromUrl,
  readEntityRelations,
  readEntityTextValue,
  resolveTemplateImageUrl,
} from '../ontology';

export interface SourceSeed {
  id: string;
  name?: string | null;
  spaceId?: string | null;
}

interface TweetAuthorMetadata {
  name?: string;
  handle?: string;
  avatarUrl?: string | null;
}

const SOURCE_TWEET_AUTHORS_QUERY = parse(/* GraphQL */ `
  query SourceCardTweetAuthors(
    $ids: [UUID!]!
    $authorsPropertyId: UUID!
    $avatarPropertyId: UUID!
    $webUrlPropertyId: UUID!
    $imageUrlPropertyId: UUID!
    $xPropertyId: UUID!
  ) {
    entities(first: 24, filter: { id: { in: $ids } }) {
      id
      valuesList(first: 6, filter: { propertyId: { is: $webUrlPropertyId } }) {
        propertyId
        text
      }
      relationsList(first: 4, filter: { typeId: { is: $authorsPropertyId } }) {
        toEntityId
        toEntity {
          id
          name
          valuesList(first: 2, filter: { propertyId: { is: $xPropertyId } }) {
            propertyId
            text
          }
          relationsList(first: 2, filter: { typeId: { is: $avatarPropertyId } }) {
            toEntity {
              valuesList(first: 4, filter: { propertyId: { is: $imageUrlPropertyId } }) {
                propertyId
                text
              }
            }
          }
        }
      }
    }
  }
`) as TypedDocumentNode<
  {
    entities?: {
      id: string;
      valuesList?: { propertyId: string; text?: string | null }[] | null;
      relationsList?:
        | {
            toEntityId: string;
            toEntity?: {
              id: string;
              name?: string | null;
              valuesList?: { propertyId: string; text?: string | null }[] | null;
              relationsList?:
                | {
                    toEntity?: {
                      valuesList?: { propertyId: string; text?: string | null }[] | null;
                    } | null;
                  }[]
                | null;
            } | null;
          }[]
        | null;
    }[];
  },
  {
    ids: string[];
    authorsPropertyId: string;
    avatarPropertyId: string;
    webUrlPropertyId: string;
    imageUrlPropertyId: string;
    xPropertyId: string;
  }
>;

/**
 * Author name, handle and avatar for social posts, keyed by the post's hex id.
 *
 * The handle comes from the post's own X URL first and the author's X property second, so a post
 * whose link points elsewhere (a blog post by an organization) still shows the author's handle.
 */
export async function fetchPostAuthorMetadata(postIds: readonly string[]): Promise<Map<string, TweetAuthorMetadata>> {
  const entities = await Effect.runPromise(
    graphql({
      query: SOURCE_TWEET_AUTHORS_QUERY,
      variables: {
        ids: [...postIds],
        authorsPropertyId: TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
        avatarPropertyId: TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID,
        webUrlPropertyId: TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID,
        imageUrlPropertyId: TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID,
        xPropertyId: X_PROPERTY,
      },
      decoder: data => data.entities ?? [],
    })
  );

  const map = new Map<string, TweetAuthorMetadata>();
  for (const item of entities) {
    const hex = ID.uuidToHex(item.id);
    const urlVal = item.valuesList?.find(v => ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID))?.text;
    const author = item.relationsList?.[0]?.toEntity;
    const authorX = author?.valuesList?.find(v => ID.equals(v.propertyId, X_PROPERTY))?.text;
    const handle = handleFromSocialUrl(urlVal) ?? handleFromXValue(authorX);
    const authorName = author?.name?.trim() || undefined;
    const rawAvatar = author?.relationsList
      ?.flatMap(rel => rel.toEntity?.valuesList ?? [])
      .find(v => ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID) && Boolean(v.text?.trim()))?.text;
    map.set(hex, {
      name: authorName,
      handle,
      avatarUrl: resolveTemplateImageUrl(rawAvatar),
    });
  }
  return map;
}

/** The author card for a Post or Tweet page: name, handle and avatar from the Authors relation. */
export function usePostAuthorMetadata(postId: string | undefined): TweetAuthorMetadata | undefined {
  const hex = postId ? ID.uuidToHex(postId) : '';
  const query = useQuery({
    queryKey: ['hydrated-source-cards', 'tweet-authors', hex],
    enabled: Boolean(hex),
    staleTime: 120_000,
    queryFn: () => fetchPostAuthorMetadata([hex]),
  });
  return hex ? query.data?.get(hex) : undefined;
}

/** An X property holds a handle (`shashj`), an `@handle`, or a whole profile URL. */
function handleFromXValue(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || /^(www\.)?(x|twitter)\.com\//i.test(trimmed)) {
    return handleFromSocialUrl(/^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  }
  if (/^@?[A-Za-z0-9_]{1,15}$/.test(trimmed)) return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  return undefined;
}

function isSocialPostUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    return /(^|\.)(x\.com|twitter\.com)$/i.test(new URL(rawUrl.trim()).hostname);
  } catch {
    return false;
  }
}

function isVideoUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    return /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/i.test(new URL(rawUrl.trim()).hostname);
  } catch {
    return false;
  }
}

function classifySourceEntity(
  hydrated: Entity | undefined,
  webUrl: string | undefined
): { kind: EntityLinkKind; label: string; mediaType: SourceMediaKind } {
  const typeIds = hydrated?.types?.map(t => t.id) ?? [];
  const firstTypeName = hydrated?.types?.find(t => t.name)?.name ?? null;

  if (
    typeIds.some(
      id => ID.equals(id, TEMPLATE_ONTOLOGY.TWEET_TYPE_ID) || ID.equals(id, TEMPLATE_ONTOLOGY.POST_TYPE_ID)
    ) ||
    isSocialPostUrl(webUrl)
  ) {
    return { kind: 'post', label: firstTypeName ?? 'Post', mediaType: 'tweet' };
  }
  if (typeIds.some(id => ID.equals(id, NEWS_STORY_TYPE_ID))) {
    return { kind: 'news-story', label: firstTypeName ?? 'News story', mediaType: 'article' };
  }
  if (typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.ARTICLE_TYPE_ID))) {
    return { kind: 'source', label: firstTypeName ?? 'Article', mediaType: 'article' };
  }
  if (typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.EPISODE_TYPE_ID)) || isVideoUrl(webUrl)) {
    return { kind: 'source', label: firstTypeName ?? 'Video', mediaType: 'video' };
  }
  if (typeIds.some(id => ID.equals(id, DEBATE_TYPE_ID))) {
    return { kind: 'debate', label: firstTypeName ?? 'Debate', mediaType: 'video' };
  }
  if (typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.DATASET_TYPE_ID))) {
    return { kind: 'source', label: firstTypeName ?? 'Dataset', mediaType: 'dataset' };
  }
  if (webUrl) {
    return { kind: 'source', label: firstTypeName ?? 'Article', mediaType: 'article' };
  }
  return { kind: 'source', label: firstTypeName ?? 'Source', mediaType: 'document' };
}

/**
 * Batch-hydrates linked `Sources` entities (from Claim, Event, or Post pages) into rich,
 * format-aware `EntityLinkRowModel` cards suitable for `RelatedListSection` (`layout: 'cards'`).
 */
export function useHydratedSourceCards({
  sources,
  spaceId,
  enabled = true,
}: {
  sources: readonly SourceSeed[];
  spaceId: string;
  enabled?: boolean;
}): {
  items: EntityLinkRowModel[];
  isLoading: boolean;
} {
  const sourceIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const src of sources) {
      const hex = ID.uuidToHex(src.id);
      if (seen.has(hex)) continue;
      seen.add(hex);
      ids.push(src.id);
    }
    return ids;
  }, [sources]);

  const where = React.useMemo(() => ({ id: { in: sourceIds } }), [sourceIds]);
  const { entities: hydratedEntities, isLoading: isEntitiesLoading } = useQueryEntities({
    where,
    first: Math.max(sourceIds.length, 1),
    enabled: enabled && sourceIds.length > 0,
  });

  const hydratedByHex = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const item of hydratedEntities) {
      map.set(ID.uuidToHex(item.id), item);
    }
    return map;
  }, [hydratedEntities]);

  const tweetSourceIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const src of sources) {
      const hex = ID.uuidToHex(src.id);
      const hydrated = hydratedByHex.get(hex);
      const webUrl = readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
      const { mediaType } = classifySourceEntity(hydrated, webUrl);
      if (mediaType === 'tweet') ids.push(hex);
    }
    return ids;
  }, [hydratedByHex, sources]);

  const tweetAuthorsQuery = useQuery({
    queryKey: ['hydrated-source-cards', 'tweet-authors', tweetSourceIds.join(',')],
    enabled: enabled && tweetSourceIds.length > 0,
    staleTime: 120_000,
    queryFn: () => fetchPostAuthorMetadata(tweetSourceIds),
  });

  const items = React.useMemo<EntityLinkRowModel[]>(() => {
    const tweetAuthorsByHex = tweetAuthorsQuery.data;
    return sources.map(src => {
      const hex = ID.uuidToHex(src.id);
      const hydrated = hydratedByHex.get(hex);
      const webUrl = readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
      const { kind, label, mediaType } = classifySourceEntity(hydrated, webUrl);
      const tweetMeta = mediaType === 'tweet' ? tweetAuthorsByHex?.get(hex) : undefined;
      const publisherRel = readEntityRelations(hydrated, TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID)[0];
      const authorRel = readEntityRelations(hydrated, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID)[0];
      const publisher =
        mediaType === 'tweet'
          ? (tweetMeta?.name ?? authorRel?.toEntity.name?.trim() ?? tweetMeta?.handle ?? label)
          : (publisherRel?.toEntity.name?.trim() ?? publicationFromUrl(webUrl) ?? label);
      const date = formatOntologyDate(
        readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID) ??
          readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.AIR_DATE_PROPERTY_ID)
      );
      const excerpt =
        readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.SUMMARY_PROPERTY_ID) ?? hydrated?.description ?? undefined;
      const rawThumb = hydrated ? (Entities.cover(hydrated.relations) ?? Entities.avatar(hydrated.relations)) : null;
      const thumbnailUrl = resolveTemplateImageUrl(rawThumb) ?? undefined;
      const targetSpace = hydrated ? resolveEntitySpaceId(hydrated, src.spaceId ?? spaceId) : (src.spaceId ?? spaceId);

      return {
        id: src.id,
        kind,
        kindLabel: label,
        mediaType,
        title: hydrated?.name?.trim() || src.name?.trim() || src.id,
        publisher,
        authorHandle: mediaType === 'tweet' ? (tweetMeta?.handle ?? handleFromSocialUrl(webUrl)) : undefined,
        authorAvatarUrl:
          mediaType === 'tweet'
            ? (tweetMeta?.avatarUrl ?? resolveTemplateImageUrl(hydrated ? Entities.avatar(hydrated.relations) : null))
            : undefined,
        date,
        excerpt,
        thumbnailUrl,
        externalUrl: webUrl,
        href: NavUtils.toEntity(targetSpace, src.id),
      };
    });
  }, [hydratedByHex, sources, spaceId, tweetAuthorsQuery.data]);

  return {
    items,
    isLoading: sourceIds.length > 0 && isEntitiesLoading,
  };
}
