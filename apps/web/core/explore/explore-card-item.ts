import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { getRecordingUrls } from '~/core/community-calls/recordings';
import { DEBATE_TYPE_ID, DEBATE_VIDEOS_PROPERTY_ID } from '~/core/debates/ontology';
import { EntityDecoder } from '~/core/io/decoders/entity';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';
import { getRelationVideoUrls } from '~/core/utils/relation-video';

import {
  EXPLORE_AVATAR_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
} from './explore-constants';
import { parseEntityUpdatedAtToUnixSec } from './explore-relative-time';

/**
 * Everything an `ExploreFeedCard` renders, and nothing about how it was found.
 *
 * Lives here rather than beside the feed query because the card is no longer the explore feed's
 * alone — a topic's Coverage section draws the same card from a different query
 * (`relationsConnection` rather than a feed connection), and a shared card needs a shared item
 * shape or the two callers drift into two subtly different cards.
 */
export type ExploreFeedItem = {
  entityId: string;
  spaceId: string;
  spaceName: string;
  spaceImage: string | null;
  types: { id: string; name: string | null }[];
  createdAtSec: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  recordingUrls: string[];
  debateVideoUrls: string[];
  commentCount: number;
  isMemberOrEditor: boolean;
  hasPendingMembershipRequest: boolean;
};

/**
 * An item before the parts that can only be answered by asking about the *space* are filled in.
 *
 * The split is not cosmetic: a space's name, thumbnail and the viewer's standing in it come from
 * different sources than the entity, and the two callers resolve them differently — the feed reads
 * the browse sidebar it already has, Coverage looks up arbitrary spaces it has never seen.
 */
export type ExploreFeedRow = Omit<ExploreFeedItem, 'spaceName' | 'spaceImage' | 'hasPendingMembershipRequest'>;

/**
 * Whether the entity behind a card is a debate.
 *
 * Keyed on the entity's own types rather than on which card component drew it, which is the part
 * that matters: `ExploreFeedCard` hands a debate to `DebateExploreFeedCard`, but that card falls
 * back to the generic one whenever the debate cannot actually be watched — so a rule written
 * against the card would quietly stop applying to exactly the debates that took the fallback.
 *
 * `normId` because ids reach the feed in both UUID and hyphenless spellings depending on the query
 * that found them.
 */
export function isDebateEntity(types: readonly { id: string }[]): boolean {
  return types.some(type => normId(type.id) === normId(DEBATE_TYPE_ID));
}

/** A decoded entity plus the two fields the card needs that aren't part of `Entity`. */
export type ExploreCardEntity = Entity & { commentCount: number; createdAt?: string };

/** The comment relation type — `backlinks` through it is how a card gets its comment count. */
export const COMMENT_RELATION_TYPE_ID = '310d4a240e5b451cb2151bfce40d0fe6';

/**
 * One node of an explore-card selection, decoded.
 *
 * Takes a raw node rather than a typed shape because the three feed connections and
 * `relationsConnection.nodes.fromEntity` all produce the same fields under different parents, and
 * `EntityDecoder` is the thing that validates them.
 */
export function decodeExploreCardEntity(node: unknown): ExploreCardEntity | null {
  if (!node || typeof node !== 'object') return null;
  const raw = node as Record<string, unknown> & { backlinks?: { totalCount?: number } | null; createdAt?: string };
  const decoded = EntityDecoder.decode(raw);
  if (!decoded) return null;
  return { ...decoded, commentCount: raw.backlinks?.totalCount ?? 0, createdAt: raw.createdAt };
}

function pickDisplaySpaceId(entity: Entity, allowed: Set<string>): string | null {
  for (const sid of entity.spaces) {
    if (allowed.has(normId(sid))) return sid;
  }
  return entity.spaces[0] ?? null;
}

function textValueForProperty(entity: Entity, propertyId: string, spaceId: string): string | null {
  const pid = normId(propertyId);
  const sid = normId(spaceId);
  const row = entity.values.find(v => normId(v.property.id) === pid && normId(v.spaceId) === sid);
  if (!row?.value) return null;
  const t = row.value.trim();
  return t.length ? t : null;
}

function imageFromRelationMedia(relations: Entity['relations'], spaceId: string): string | null {
  if (!relations?.length) return null;
  const sid = normId(spaceId);
  const coverT = normId(SystemIds.COVER_PROPERTY);
  const avatarT = normId(ContentIds.AVATAR_PROPERTY);
  const pool = relations.filter(r => normId(r.spaceId) === sid);
  const scan = pool.length ? pool : relations;
  for (const r of scan) {
    if (normId(r.type.id) === coverT && r.toEntity.value) {
      const v = r.toEntity.value.trim();
      if (v) return v;
    }
  }
  for (const r of scan) {
    if (normId(r.type.id) === avatarT && r.toEntity.value) {
      const v = r.toEntity.value.trim();
      if (v) return v;
    }
  }
  return null;
}

export function imageFromEntity(entity: Entity, spaceId: string): string | null {
  const cover = textValueForProperty(entity, EXPLORE_COVER_PROPERTY_ID, spaceId);
  if (cover) return cover;
  const av = textValueForProperty(entity, EXPLORE_AVATAR_PROPERTY_ID, spaceId);
  if (av) return av;
  return imageFromRelationMedia(entity.relations, spaceId);
}

/**
 * Decoded entities to card rows.
 *
 * `allowedSpaceIds` is a preference, not a filter: an entity whose spaces are all outside the set
 * still renders, in its own first space. The feed passes the spaces it is scoped to; Coverage
 * passes the valid spaces its own rows named, which is how a row that spans several spaces lands on
 * one a reader can actually open.
 */
export function buildExploreFeedRows(
  entities: ExploreCardEntity[],
  allowedSpaceIds: Set<string>,
  memberOrEditorSpaceIds: Set<string>
): ExploreFeedRow[] {
  const items: ExploreFeedRow[] = [];

  const typesRelationIdNorm = normId(SystemIds.TYPES_PROPERTY);

  for (const e of entities) {
    const spaceId = pickDisplaySpaceId(e, allowedSpaceIds);
    if (!spaceId) continue;

    // Prefer space-scoped values so a card rendered for space A doesn't leak values
    // from space C. Fall back to the top-level aggregated name/description when the
    // entity has no value in the display space — avoids "Untitled" cards purely
    // because of the space boundary.
    const title = textValueForProperty(e, EXPLORE_ENTITY_NAME_PROPERTY_ID, spaceId) ?? e.name?.trim() ?? 'Untitled';
    const description =
      textValueForProperty(e, EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID, spaceId) ?? e.description ?? null;

    const displaySpaceIdNorm = normId(spaceId);
    const relationsInDisplaySpace = e.relations.filter(r => normId(r.spaceId) === displaySpaceIdNorm);
    const types = relationsInDisplaySpace
      .filter(r => normId(r.type.id) === typesRelationIdNorm)
      .map(r => ({ id: r.toEntity.id, name: r.toEntity.name }));

    items.push({
      entityId: e.id,
      spaceId,
      types,
      createdAtSec: parseEntityUpdatedAtToUnixSec(e.createdAt),
      title,
      description,
      imageUrl: imageFromEntity(e, spaceId),
      recordingUrls: getRecordingUrls(relationsInDisplaySpace),
      debateVideoUrls: getRelationVideoUrls(relationsInDisplaySpace, DEBATE_VIDEOS_PROPERTY_ID),
      commentCount: e.commentCount,
      isMemberOrEditor: memberOrEditorSpaceIds.has(normId(spaceId)),
    });
  }

  return items;
}
