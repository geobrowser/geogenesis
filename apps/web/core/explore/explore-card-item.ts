import { countActivityForNode } from '~/core/claims/browse/claim-activity-fields';
import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { getRecordingUrls } from '~/core/community-calls/recordings';
import { isDebateEntity } from '~/core/debates/is-debate-entity';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_VIDEOS_PROPERTY_ID } from '~/core/debates/ontology';
import { EntityDecoder } from '~/core/io/decoders/entity';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';
import { getRelationVideoUrls } from '~/core/utils/relation-video';
import { getSpaceRank, getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

import {
  EXPLORE_AVATAR_PROPERTY_ID,
  EXPLORE_COVER_PROPERTY_ID,
  EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID,
  EXPLORE_ENTITY_NAME_PROPERTY_ID,
} from './explore-constants';
import { parseEntityUpdatedAtToUnixSec } from './explore-relative-time';

/**
 * The claim a Debate argued, as the card needs it: enough to title the card and to open the claim.
 *
 * Read from the graph rather than from geo-chat's `debate.claim`, even though the debate card
 * already loads that: the geo-chat lookup is viewport-gated and asynchronous, so a title taken
 * from it would render empty (or as the debate's own name) and then swap under the reader. The
 * relation is already on the entity the card was built from.
 */
export type ExploreDebateClaim = {
  entityId: string;
  name: string;
};

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
  /** The claim this Debate argued. `null` on every non-debate, and on a debate missing the relation. */
  debateClaim: ExploreDebateClaim | null;
  commentCount: number;
  /**
   * Debates, extracted claims and every comment under them — what the claim page's Activity heading
   * counts. Optional because only a claim card reads it, and only the explore selections fetch it;
   * a row built by hand or by another feed simply has none.
   */
  activityCount?: number;
  /**
   * How many of {@link activityCount} are this claim's own comments.
   *
   * The card's live count needs it to stay exact: the comment list it can watch measures precisely
   * this part of the total, so swapping the fetched-at number for the live one keeps the rest of the
   * aggregate intact. Without it the pill had to guess from pending rows and fell back to the stale
   * total the moment a post was indexed.
   */
  activityCommentCount?: number;
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
 * A row plus what only a space lookup can answer.
 *
 * The three surfaces that resolve spaces themselves — a topic's Coverage, and
 * the two halves of a person's record — all need this, and all wrote it out
 * separately. `hasPendingMembershipRequest` is false because the Join button it
 * belongs to is hidden on every one of them, and the flag only ever changes
 * that button's label.
 */
export function toExploreFeedItem(row: ExploreFeedRow, label: { name: string; image: string | null } | undefined) {
  return {
    ...row,
    // The same last resort the feed uses when a space has no name yet: an id
    // fragment, which at least differs between two spaces where a shared
    // placeholder would not.
    spaceName: label?.name ?? row.spaceId.slice(0, 8),
    spaceImage: label?.image ?? null,
    hasPendingMembershipRequest: false,
  } satisfies ExploreFeedItem;
}

/** A decoded entity plus the fields the card needs that aren't part of `Entity`. */
export type ExploreCardEntity = Entity & {
  commentCount: number;
  activityCount: number;
  activityCommentCount: number;
  createdAt?: string;
};

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
  const activity = countActivityForNode(raw);

  return {
    ...decoded,
    commentCount: raw.backlinks?.totalCount ?? 0,
    // Everything in this claim's activity tree, counted the same way the claim page counts it.
    // Zero for anything that is not a claim, which is what those aggregates come back as.
    activityCount: activity.total,
    activityCommentCount: activity.comments,
    createdAt: raw.createdAt,
  };
}

const DEBATE_CLAIMS_RELATION = normId(DEBATE_CLAIMS_PROPERTY_ID);

/**
 * The claim behind a Debate entity, from its own `Claims` relation.
 *
 * Takes the entity's types, not just its relations, because `Claims` is **not** a debate-only
 * relation: `debate-publish-draft` writes it once from the debate, for the motion that was argued,
 * and again from every transcript text block, for the claims extracted out of that block's speech.
 * Keyed on the relation alone, any text block drawn as a card — a data block's explore view renders
 * whatever its query returns — would be re-headed and re-linked to one of those extracted claims.
 * The entity type is what tells the two apart, so it is required here rather than left to each
 * caller to remember; that is what makes `debateClaim`'s "null on every non-debate" an invariant
 * rather than a hope.
 *
 * A Debate carries exactly one such relation, so the first match is the motion.
 *
 * Returns null rather than an unnamed target for a relation whose claim has no name: a title is
 * the whole point here, and the caller has the debate's own name to fall back to.
 */
export function debateClaimFromEntity(
  types: readonly { id: string }[] | undefined,
  relations: Entity['relations'] | undefined
): ExploreDebateClaim | null {
  if (!isDebateEntity(types)) return null;

  for (const relation of relations ?? []) {
    if (relation.isDeleted === true) continue;
    if (normId(relation.type.id) !== DEBATE_CLAIMS_RELATION) continue;
    const name = relation.toEntity.name?.trim();
    if (!name) continue;
    return { entityId: relation.toEntity.id, name };
  }
  return null;
}

/**
 * Which space's version of an entity a card renders: **the top-ranked one**.
 *
 * This took three goes to get right, so the reasoning is worth keeping.
 *
 * `entity.spaces` is sorted by `sortSpaceIdsByRank`, which *looks* like it
 * already answers this — but that sort deliberately leaves equally-ranked ids in
 * their incoming order, and `SPACE_RANK` is a hard-coded table of ten spaces, so
 * nearly every real pair is a tie. Taking the first element therefore meant
 * "whatever order the graph returned", which for a claim in both Relationships
 * and somebody's personal space was the personal one.
 *
 * `getTopRankedSpaceId` is the codebase's own answer and breaks ties
 * deterministically, so it is used here rather than a rule invented for this
 * path.
 *
 * **Typed beats untyped among equally-ranked spaces.** A personal space
 * routinely carries a name-only copy of an entity, and rendering that copy gives
 * a claim with no Claim type — which on the feed means no Agree/Disagree at all,
 * because the card dispatcher reads the types of the space it was handed. Where
 * the ranking table cannot separate two spaces, the one that holds a real record
 * is the better answer than whichever id sorts lower, so this narrows to the
 * typed candidates *before* ranking them and falls back to all of them when none
 * is typed.
 */
function pickDisplaySpaceId(entity: Entity, allowed: Set<string>): string | null {
  const candidates = entity.spaces.filter(sid => allowed.has(normId(sid)));
  // A caller whose allowed set matches nothing the entity is in gets the
  // entity's own spaces rather than no card at all.
  const pool = candidates.length > 0 ? candidates : entity.spaces;
  if (pool.length === 0) return null;

  const typesRelationIdNorm = normId(SystemIds.TYPES_PROPERTY);
  const typedSpaces = new Set(
    entity.relations.filter(r => normId(r.type.id) === typesRelationIdNorm).map(r => normId(r.spaceId))
  );

  // Rank first, strictly. Typing is only allowed to separate spaces the ranking
  // table cannot — otherwise a name-only copy in a personal space would beat a
  // canonical space that simply has its types written elsewhere, which is the
  // ranking overruled rather than refined.
  const bestRank = Math.min(...pool.map(getSpaceRank));
  const bestRanked = pool.filter(sid => getSpaceRank(sid) === bestRank);

  const typed = bestRanked.filter(sid => typedSpaces.has(normId(sid)));

  return getTopRankedSpaceId(typed.length > 0 ? typed : bestRanked);
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
      debateClaim: debateClaimFromEntity(types, relationsInDisplaySpace),
      commentCount: e.commentCount,
      activityCount: e.activityCount,
      activityCommentCount: e.activityCommentCount,
      isMemberOrEditor: memberOrEditorSpaceIds.has(normId(spaceId)),
    });
  }

  return items;
}
