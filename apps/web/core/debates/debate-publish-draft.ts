import { Position } from '@geoprotocol/geo-sdk/lite';

import { v5 as uuidv5 } from 'uuid';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { ID } from '~/core/id';
import type { DataType, Relation, Value } from '~/core/types';

import {
  AUTHORS_PROPERTY_ID,
  BLOCKS_PROPERTY_ID,
  CLAIM_ADDRESSES_PROPERTY_ID,
  CLAIM_AXIS_SCORE_PROPERTY_IDS,
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_HIGHLIGHT_SCORE_PROPERTY_ID,
  CLAIM_OPPOSES_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  CLAIM_SUPPORTS_PROPERTY_ID,
  type ClaimAxisScoreField,
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_PARTICIPANTS_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TAG_ID,
  DEBATE_TRANSCRIPTS_PROPERTY_ID,
  DEBATE_TYPE_ID,
  DEBATE_VIDEOS_PROPERTY_ID,
  IMAGE_TYPE_ID,
  IMAGE_URL_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
  MARKDOWN_CONTENT_PROPERTY_ID,
  NAME_PROPERTY_ID,
  OG_IMAGE_PROPERTY_ID,
  SELECTOR_TYPE_ID,
  SOURCES_PROPERTY_ID,
  TARGET_PROPERTY_ID,
  TEXT_BLOCK_TYPE_ID,
  TRANSCRIPT_TYPE_ID,
  TYPES_PROPERTY_ID,
  VIDEO_TYPE_ID,
  VIDEO_URL_PROPERTY_ID,
  WEB_URL_PROPERTY_ID,
} from './ontology';

export type DebatePublishParticipant = {
  /** The participant's personal-space system entity id (dashless). */
  spaceEntityId: string;
  displayName: string | null;
  /** true = argued the "yes"/supporting side, false = the "no"/opposing side. */
  position: boolean;
  participantSlot: number;
};

export type DebatePublishTurn = {
  /**
   * The turn's index in geo-chat's canonical `{ turns }` payload. Claims attach to their turn's block
   * by this value — carried explicitly rather than re-derived from array position after a JS-side
   * filter, so attribution stays correct even when Rust and JS disagree on what counts as whitespace
   * (e.g. U+FEFF) and their turn arrays would otherwise drift out of alignment.
   */
  turnIndex: number;
  /** Space system entity id of whoever spoke this turn. */
  speakerSpaceEntityId: string;
  speakerName: string | null;
  text: string;
};

/**
 * An extracted claim's stance toward the debate's motion (GEO-3142), as geo-chat's extractor
 * judged it from the claim's content — not from the speaker's side.
 */
export type ClaimStance = 'supports' | 'opposes' | 'addresses';

/** The relation each stance is published as, from the claim to the motion. */
export const CLAIM_STANCE_PROPERTY_IDS: Record<ClaimStance, string> = {
  supports: CLAIM_SUPPORTS_PROPERTY_ID,
  opposes: CLAIM_OPPOSES_PROPERTY_ID,
  addresses: CLAIM_ADDRESSES_PROPERTY_ID,
};

/** A topic entity to relate to via Topics. The name is for display only; publishing writes the id. */
export type DebatePublishTopic = { id: string; name: string | null };

export type DebateClaimInput = {
  /** The claim text (becomes the Claim entity name). */
  text: string;
  /** True = verifiable fact, False = opinion, null = unclassified. */
  isFactual: boolean | null;
  /**
   * geo-chat's `turn_index` for the turn this claim was extracted from — matched against each turn's
   * own `turnIndex` (not array position), so the claim attaches to the correct turn's text block and
   * rides its Authors relation for speaker attribution.
   */
  turnIndex: number;
  /**
   * Find-or-create: the already-published Claim entity in the debate's space that geo-chat judged
   * logically equivalent to this claim (its `existing_entity_id`). When set, the draft references
   * that entity — the block's Claims relation and the claim's Sources relation point at it — and
   * mints nothing: no Name, no Types, no Is factual, so an entity we did not create keeps its own
   * facts. Null/absent mints a fresh Claim as before.
   */
  existingClaimEntityId?: string | null;
  /**
   * GEO-2870 D1: the stable id geo-chat minted for this claim (its `entity_id`), so a claim can be
   * requested by id before this publish runs. When there is no `existingClaimEntityId`, the Claim
   * is minted with exactly this id instead of a fresh one; a reference always wins over it. The
   * id is deterministic per debate and claim, so claims sharing it are one entity, minted once.
   * Null/absent (payloads from before D1) mints a fresh id as before.
   */
  stableEntityId?: string | null;
  /**
   * Topics the extractor assigned to this claim, selected from the debated claim's own topic
   * set ({KG entity id, name}). Written on minted and reused claims alike; for a reused entity
   * the reuse policy has already subtracted the topics the entity carries on the graph, so the
   * draft never writes a duplicate Topics relation.
   */
  topics?: DebatePublishTopic[];
  /**
   * True when the claim is broad enough to be argued for and against. Tagged `Debate`
   * so it joins the claim picker's candidate motions; a narrowly verifiable claim
   * publishes as a Claim like any other, just untagged. For a reused entity the reuse
   * policy has already cleared this when the entity carries the tag already.
   */
  isContestable?: boolean;
  /**
   * When in the debate this claim was said, in integer milliseconds on the transcript's clock:
   * geo-chat's `start_ms`/`end_ms`, the span of the transcript it was extracted from (GEO-2958).
   * Written onto the block → claim relation entity, where the app reads it as a certainty — so
   * this is null whenever geo-chat did not measure it, and the app falls back to matching.
   */
  timing?: { startMs: number; endMs: number } | null;
  /**
   * How much this claim carries the debate — geo-chat's `highlight_score`, the probability that
   * the debate's claim list would misrepresent the debate without it (0–1). Written onto the
   * block → claim relation entity beside the offsets, where the player ranks claims by it. Null
   * whenever geo-chat did not score the claim (scoring off, or that claim's request failed), and
   * nothing is written.
   */
  highlightScore?: number | null;
  /**
   * The three axis scores the same scoring run returns — geo-chat's `relevance_score`,
   * `quality_score`, `controversy_score`, each 0–1. Written beside the highlight score on the
   * block → claim relation entity, each only when present; null or absent writes nothing.
   */
  relevanceScore?: number | null;
  qualityScore?: number | null;
  controversyScore?: number | null;
  /**
   * GEO-3142: the claim's stance toward the debated claim, written as one Supports / Opposes /
   * Addresses relation from the claim to `claimEntityId`. Null/absent writes none: payloads from
   * before the classification, a verdict the extractor could not give, and a claim the stance
   * policy found already linked to the motion (so a reused entity never gets a second one).
   */
  stance?: ClaimStance | null;
};

export type DebatePublishInput = {
  /** geo-chat debate UUID (with dashes). Becomes the Debate entity id, dashless. */
  debateId: string;
  /** The DAO space the debate is published to (debate.claim.space_id, dashless). */
  spaceId: string;
  /** The already-published Claim entity the debate argued. */
  claimEntityId: string;
  claimText: string;
  /**
   * What the debate argued. A question debate has no sides and no main claim, so its claims get
   * no Supports / Opposes / Addresses relation, whatever stance they carry — they keep only their
   * link to the question. Absent reads as `claim`, which every debate is until question debates
   * ship.
   */
  subjectKind?: 'claim' | 'question';
  /**
   * The debated claim's Topics in this space, mirrored onto the Debate entity so the debate is
   * filed under the same topics as the claim it argued. Optional — omitted/empty publishes the
   * Debate with no Topics relations.
   */
  claimTopics?: DebatePublishTopic[];
  participants: DebatePublishParticipant[];
  /**
   * Durable https URL for the rendered final video (the geo-chat `…/media/artifacts/{kind}/content`
   * redirect), or null to skip the Video entity.
   */
  videoUrl: string | null;
  /** Durable https URL for the video's poster still, or null to publish the Video without one. */
  keyframeUrl: string | null;
  /**
   * `ipfs://` URI for the rendered share card, or null to publish without one.
   *
   * Null is the expected shape when the card could not be built, not an error: a debate published
   * without a share card is a far better outcome than one that fails to publish (GEO-2755).
   */
  ogImageUrl: string | null;
  /** Merged per-turn transcript. Empty skips the Transcript entity. */
  transcriptTurns: DebatePublishTurn[];
  /**
   * Claims extracted from the transcript, each attributed to a turn by its post-filter index in
   * `transcriptTurns`. Optional — omitted/empty publishes the debate with no extracted claims.
   */
  claims?: DebateClaimInput[];
};

export type DebatePublishDraft = {
  /** Deterministic Debate entity id (dashless UUID derived from the debate id). */
  debateEntityId: string;
  debateName: string;
  values: Value[];
  relations: Relation[];
};

type BuildOptions = {
  /**
   * Mint ids with this instead of deriving them from the debate. Tests use it to get readable ids;
   * production leaves it unset, so every id in the edit is derived ({@link debatePublishId}).
   */
  createEntityId?: () => string;
  createPosition?: () => string;
};

/**
 * Build the GRC-20 draft (app-shape `Value[]` + `Relation[]`) for a finished debate,
 * following the debates ontology: a Debate entity linked to a Video, the debated Claim,
 * the supporting/opposing participants, and a Transcript of per-turn text blocks.
 *
 * Pure: no network, no wallet. Feed the result through
 * `Publish.prepareLocalDataForPublishing` to get `Op[]`.
 */
export function buildDebatePublishDraft(input: DebatePublishInput, options: BuildOptions = {}): DebatePublishDraft {
  const createPosition = options.createPosition ?? Position.generate;

  const claimText = input.claimText.trim();
  if (claimText.length === 0) throw new Error('Debate claim text is required.');
  if (input.participants.length === 0) throw new Error('A debate needs participants to publish.');

  const debateEntityId = ID.uuidToHex(input.debateId);

  // Every id this edit mints is derived from the debate and what the id names, so publishing the
  // same debate twice writes the same entities and relations again rather than second copies (the
  // indexer upserts relations on id, and value ids are already per entity and property). The sweep
  // decides "already published" by finding the Debate entity in the graph, so while the indexer
  // lags it publishes again; on 2026-10-05 that left 11 to 16 copies of three debates' Transcript,
  // Video and share card, and of every relation on the Debate. A key repeated within one edit gets
  // its occurrence appended, so ids stay unique however the input repeats itself.
  const keyOccurrences = new Map<string, number>();
  const derivedId = (key: string) => {
    const occurrence = keyOccurrences.get(key) ?? 0;
    keyOccurrences.set(key, occurrence + 1);
    return debatePublishId(debateEntityId, occurrence === 0 ? key : `${key}#${occurrence}`);
  };
  const mintEntityId = (key: string) =>
    options.createEntityId ? options.createEntityId() : derivedId(`entity:${key}`);

  const bySlot = [...input.participants].sort((a, b) => a.participantSlot - b.participantSlot);
  const nameFor = (p: DebatePublishParticipant) => (p.displayName?.trim() ? p.displayName.trim() : 'Anonymous');
  // "<claim> | <A> vs. <B>": the motion leads, the matchup follows. Names are read in
  // truncating surfaces — feed cards, side-panel headers, edit titles — where the first
  // words are the ones that survive, and what a debate is about identifies it far better
  // than who argued it. `join` rather than a two-name template: the shape is a pair today,
  // but nothing in the publisher caps participants at two.
  const debateName = `${claimText} | ${bySlot.map(nameFor).join(' vs. ')}`;
  /**
   * The Video, its keyframe, the share card and the Transcript are named after the debate they
   * belong to, qualified by what they are. One closure so the separator is declared once: it is
   * the same `|` the debate name is built from, and four inline templates would have to agree
   * about that by hand.
   */
  const derivedName = (qualifier: string) => `${debateName} | ${qualifier}`;

  const values: Value[] = [];
  const relations: Relation[] = [];

  const setText = (entityId: string, entityName: string | null, propertyId: string, value: string) => {
    values.push(makeTextValue({ entityId, entityName, propertyId, value, spaceId: input.spaceId }));
  };

  const setBoolean = (entityId: string, entityName: string | null, propertyId: string, value: boolean) => {
    values.push(
      makeBooleanValue({ entityId, entityName, propertyId, value: value ? 'true' : 'false', spaceId: input.spaceId })
    );
  };

  // Group extracted claims by their turn's `turnIndex`, so the transcript loop can attach each to its
  // source block by matching `turn.turnIndex` — independent of array position after the filter below.
  const claimsByTurnIndex = new Map<number, DebateClaimInput[]>();
  for (const claim of input.claims ?? []) {
    const list = claimsByTurnIndex.get(claim.turnIndex);
    if (list) list.push(claim);
    else claimsByTurnIndex.set(claim.turnIndex, [claim]);
  }

  const relate = ({
    fromEntity,
    propertyId,
    toEntityId,
    toEntityName,
    stable = false,
  }: {
    fromEntity: { id: string; name: string | null };
    propertyId: string;
    toEntityId: string;
    toEntityName: string | null;
    /**
     * Derive the relation's ids from (from, property, to) instead of minting them — for the
     * relations that describe a claim minted under geo-chat's stable id, which the early claims
     * publish writes too. See {@link stableClaimRelationIds}.
     */
    stable?: boolean;
  }): { id: string; name: string | null } => {
    const edge = `${normalizeId(fromEntity.id)}:${normalizeId(propertyId)}:${normalizeId(toEntityId)}`;
    const ids = stable
      ? stableClaimRelationIds(fromEntity.id, propertyId, toEntityId)
      : options.createEntityId
        ? { id: options.createEntityId(), entityId: options.createEntityId() }
        : { id: derivedId(`relation:${edge}`), entityId: derivedId(`relation-entity:${edge}`) };
    const entityId = ids.entityId;
    relations.push(
      makeRelation({
        id: ids.id,
        entityId,
        position: createPosition(),
        spaceId: input.spaceId,
        propertyId,
        fromEntity,
        toEntityId,
        toEntityName,
      })
    );
    return { id: entityId, name: null };
  };

  const setInteger = (entityId: string, propertyId: string, value: number) => {
    values.push(makeIntegerValue({ entityId, entityName: null, propertyId, value, spaceId: input.spaceId }));
  };
  const setFloat = (entityId: string, propertyId: string, value: number) => {
    values.push(makeFloatValue({ entityId, entityName: null, propertyId, value, spaceId: input.spaceId }));
  };

  // One Topics relation per (entity, topic). `relate` does not dedupe, and a reused claim can appear
  // behind several extracted claims carrying the same topic. Keyed on normalized ids so the dedupe
  // agrees with the reuse policy, which compares topics as hex: the same entity written once dashed
  // and once dashless is one edge.
  const topicEdges = new Set<string>();
  const relateTopic = (fromEntity: { id: string; name: string | null }, topic: DebatePublishTopic, stable = false) => {
    const edge = `${normalizeId(fromEntity.id)}:${normalizeId(topic.id)}`;
    if (topicEdges.has(edge)) return;
    topicEdges.add(edge);
    relate({ fromEntity, propertyId: TOPICS_PROPERTY_ID, toEntityId: topic.id, toEntityName: topic.name, stable });
  };

  // --- Debate entity ---
  setText(debateEntityId, debateName, NAME_PROPERTY_ID, debateName);
  const debateRef = { id: debateEntityId, name: debateName };
  relate({ fromEntity: debateRef, propertyId: TYPES_PROPERTY_ID, toEntityId: DEBATE_TYPE_ID, toEntityName: 'Debate' });
  relate({
    fromEntity: debateRef,
    propertyId: DEBATE_CLAIMS_PROPERTY_ID,
    toEntityId: input.claimEntityId,
    toEntityName: claimText,
  });
  // The Debate is filed under the same topics as the claim it argued.
  for (const topic of input.claimTopics ?? []) relateTopic(debateRef, topic);

  for (const p of bySlot) {
    relate({
      fromEntity: debateRef,
      propertyId: p.position ? DEBATE_SUPPORTED_BY_PROPERTY_ID : DEBATE_OPPOSED_BY_PROPERTY_ID,
      toEntityId: p.spaceEntityId,
      toEntityName: p.displayName,
    });
    // Both participants also get the side-agnostic Participants relation. Supported by / Opposed by
    // already name them, but they encode *which side* — so "every debate this person was in" would
    // mean unioning two relations and knowing which one to look on. One relation makes that a
    // single filter, which is what a data block needs.
    relate({
      fromEntity: debateRef,
      propertyId: DEBATE_PARTICIPANTS_PROPERTY_ID,
      toEntityId: p.spaceEntityId,
      toEntityName: p.displayName,
    });
  }

  // --- Share card (OG image) ---
  // Same shape as the keyframe block below: an Image entity, then a relation from the debate. It
  // hangs off the debate rather than the Video because it describes the debate, and because it is
  // generated once at publish time and never revisited.
  if (input.ogImageUrl) {
    const ogImageId = mintEntityId('og-image');
    const ogImageName = derivedName('share card');
    const ogImageRef = { id: ogImageId, name: ogImageName };
    setText(ogImageId, ogImageName, NAME_PROPERTY_ID, ogImageName);
    setText(ogImageId, ogImageName, IMAGE_URL_PROPERTY_ID, input.ogImageUrl);
    relate({
      fromEntity: ogImageRef,
      propertyId: TYPES_PROPERTY_ID,
      toEntityId: IMAGE_TYPE_ID,
      toEntityName: 'Image',
    });
    relate({
      fromEntity: debateRef,
      propertyId: OG_IMAGE_PROPERTY_ID,
      toEntityId: ogImageId,
      toEntityName: ogImageName,
    });
  }

  // --- Video entity (+ its Key frame Image) ---
  if (input.videoUrl) {
    const videoId = mintEntityId('video');
    const videoName = derivedName('video');
    const videoRef = { id: videoId, name: videoName };
    setText(videoId, videoName, NAME_PROPERTY_ID, videoName);
    // Both carry the same URL: `Video URL` is what the debates ontology spec names, `Web URL` is
    // what the relation decoder reads for media entities.
    setText(videoId, videoName, VIDEO_URL_PROPERTY_ID, input.videoUrl);
    setText(videoId, videoName, WEB_URL_PROPERTY_ID, input.videoUrl);
    relate({
      fromEntity: videoRef,
      propertyId: TYPES_PROPERTY_ID,
      toEntityId: VIDEO_TYPE_ID,
      toEntityName: 'Video',
    });
    relate({
      fromEntity: debateRef,
      propertyId: DEBATE_VIDEOS_PROPERTY_ID,
      toEntityId: videoId,
      toEntityName: videoName,
    });

    if (input.keyframeUrl) {
      const keyframeId = mintEntityId('keyframe');
      const keyframeName = derivedName('keyframe');
      const keyframeRef = { id: keyframeId, name: keyframeName };
      setText(keyframeId, keyframeName, NAME_PROPERTY_ID, keyframeName);
      setText(keyframeId, keyframeName, WEB_URL_PROPERTY_ID, input.keyframeUrl);
      relate({
        fromEntity: keyframeRef,
        propertyId: TYPES_PROPERTY_ID,
        toEntityId: IMAGE_TYPE_ID,
        toEntityName: 'Image',
      });
      relate({
        fromEntity: videoRef,
        propertyId: KEY_FRAME_IMAGE_PROPERTY_ID,
        toEntityId: keyframeId,
        toEntityName: keyframeName,
      });
    }
  }

  // --- Transcript entity + per-turn text blocks ---
  const turns = input.transcriptTurns.filter(turn => turn.text.trim().length > 0);
  if (turns.length > 0) {
    const transcriptId = mintEntityId('transcript');
    const transcriptName = derivedName('transcript');
    const transcriptRef = { id: transcriptId, name: transcriptName };
    setText(transcriptId, transcriptName, NAME_PROPERTY_ID, transcriptName);
    relate({
      fromEntity: transcriptRef,
      propertyId: TYPES_PROPERTY_ID,
      toEntityId: TRANSCRIPT_TYPE_ID,
      toEntityName: 'Transcript',
    });
    relate({
      fromEntity: transcriptRef,
      propertyId: SOURCES_PROPERTY_ID,
      toEntityId: debateEntityId,
      toEntityName: debateName,
    });
    relate({
      fromEntity: debateRef,
      propertyId: DEBATE_TRANSCRIPTS_PROPERTY_ID,
      toEntityId: transcriptId,
      toEntityName: transcriptName,
    });

    // Every iteration used to mint a fresh claim id, which made these pairs unique by construction.
    // A reused entity can appear behind several extracted claims (both debaters restating the same
    // published point, or two near-duplicate extractions from one turn), and `relate` does not
    // dedupe, so the pairs are tracked: one Claims edge per (block, claim), one Sources edge per
    // claim per debate.
    const linkedBlockClaims = new Set<string>();
    const sourcedClaims = new Set<string>();
    const debateTaggedClaims = new Set<string>();
    const mintedClaims = new Set<string>();
    // One stance relation per (claim, motion), however many statements share the claim entity: a
    // reused entity or a D1 stable id can sit behind several extracted claims. The first statement
    // in transcript order decides; keyed like `debateTaggedClaims`, so verbatim twins from an
    // older payload (fresh ids) also yield one verdict per text.
    const stancedClaims = new Set<string>();
    const writesStance = (input.subjectKind ?? 'claim') === 'claim';
    const motionKey = normalizeId(input.claimEntityId);

    turns.forEach(turn => {
      const speakerName = turn.speakerName?.trim() ? turn.speakerName.trim() : 'Anonymous';
      const blockId = mintEntityId(`block:${turn.turnIndex}`);
      const blockName = `${speakerName} — ${claimText}`;
      const blockRef = { id: blockId, name: blockName };
      setText(blockId, blockName, NAME_PROPERTY_ID, blockName);
      setText(blockId, blockName, MARKDOWN_CONTENT_PROPERTY_ID, turn.text.trim());
      relate({
        fromEntity: blockRef,
        propertyId: TYPES_PROPERTY_ID,
        toEntityId: TEXT_BLOCK_TYPE_ID,
        toEntityName: 'Text block',
      });
      relate({
        fromEntity: blockRef,
        propertyId: AUTHORS_PROPERTY_ID,
        toEntityId: turn.speakerSpaceEntityId,
        toEntityName: turn.speakerName,
      });
      relate({
        fromEntity: blockRef,
        propertyId: SOURCES_PROPERTY_ID,
        toEntityId: debateEntityId,
        toEntityName: debateName,
      });
      relate({
        fromEntity: transcriptRef,
        propertyId: BLOCKS_PROPERTY_ID,
        toEntityId: blockId,
        toEntityName: blockName,
      });

      // Claims extracted from this turn. Each becomes a Claim entity linked FROM this text block via
      // the Claims relation — so attribution rides the block's Authors relation (the speaker), with no
      // separate claim→speaker property. Side (for/against) is recoverable from the participant's
      // Supported/Opposed-by membership on the Debate.
      //
      // Find-or-create: a claim geo-chat matched to an existing Claim in this space reuses that
      // entity. Nothing describing the claim is written onto it — no Name, no Types, no Is
      // factual — so a claim someone else published keeps its own facts even where this
      // extraction would have said otherwise. What is written is membership: the block's Claims
      // relation, the claim's Sources relation, and any Topics the entity does not already carry
      // in this space (the reuse policy subtracts the ones it does).
      for (const claim of claimsByTurnIndex.get(turn.turnIndex) ?? []) {
        const claimEntityText = claim.text.trim();
        if (claimEntityText.length === 0) continue;
        const existingClaimId = claim.existingClaimEntityId?.trim() || null;
        // A reference wins; otherwise geo-chat's stable id (D1), which anything that requested
        // this claim before it published already holds; otherwise, for older payloads, a fresh id.
        const stableClaimId = existingClaimId === null ? claim.stableEntityId?.trim() || null : null;
        const claimId =
          existingClaimId ?? stableClaimId ?? mintEntityId(`claim:${turn.turnIndex}:${claimEntityText.toLowerCase()}`);
        const claimRef = { id: claimId, name: claimEntityText };
        // GEO-2870 option A: a claim under geo-chat's stable id may already be on the graph, put
        // there by the early claims publish (`buildDebateClaimsDraft`) minutes after extraction. The
        // relations describing it take ids derived from their endpoints, the same ids that publish
        // used, so writing them again here updates those relations rather than adding second
        // copies, and the Name and Is factual values are per-(entity, property) already. Whether or
        // not the early publish ran, indexed, or ran twice, the claim ends up described once.
        const isStable = stableClaimId !== null;
        // A stable id is shared by every statement of one claim, so the entity is minted once —
        // under the first statement's text — and the later statements only link to it.
        if (existingClaimId === null && !mintedClaims.has(normalizeId(claimId))) {
          mintedClaims.add(normalizeId(claimId));
          setText(claimId, claimEntityText, NAME_PROPERTY_ID, claimEntityText);
          relate({
            fromEntity: claimRef,
            propertyId: TYPES_PROPERTY_ID,
            toEntityId: CLAIM_TYPE_ID,
            toEntityName: 'Claim',
            stable: isStable,
          });
          if (claim.isFactual !== null) {
            setBoolean(claimId, claimEntityText, CLAIM_IS_FACTUAL_PROPERTY_ID, claim.isFactual);
          }
        }
        // Topics ride both branches — a minted claim gets its full set, a reused entity only what
        // the reuse policy left after subtracting the graph's current relations. Deduped per
        // (claim, topic): a reused entity can appear behind several extracted claims carrying the
        // same topic, and `relate` does not dedupe.
        // The Debate tag is what makes a claim a candidate motion in the picker, so it
        // goes on contestable claims only — minted or reused alike, once per entity.
        // Reused entities and geo-chat's stable ids (D1) key on the id. A fresh id cannot,
        // because `mintEntityId` returns a new one per statement, so keying on it would
        // dedupe nothing: two verbatim extractions from an older payload therefore mint two
        // entities (the long-standing behaviour) but yield a single motion. Near-duplicates
        // that differ in wording still slip through — matching upstream is what catches those.
        const tagKey =
          existingClaimId || stableClaimId ? normalizeId(claimId) : `text:${claimEntityText.toLowerCase()}`;
        if (claim.isContestable && !debateTaggedClaims.has(tagKey)) {
          debateTaggedClaims.add(tagKey);
          relate({
            fromEntity: claimRef,
            propertyId: TAG_PROPERTY_ID,
            toEntityId: DEBATE_TAG_ID,
            toEntityName: 'Debate',
            stable: isStable,
          });
        }
        for (const topic of claim.topics ?? []) relateTopic(claimRef, topic, isStable);
        // Never from the motion to itself: the reuse policy refuses a reference to the motion,
        // but a stable id is not checked against it, and a self-relation is never right.
        if (writesStance && claim.stance && normalizeId(claimId) !== motionKey && !stancedClaims.has(tagKey)) {
          stancedClaims.add(tagKey);
          relate({
            fromEntity: claimRef,
            propertyId: CLAIM_STANCE_PROPERTY_IDS[claim.stance],
            toEntityId: input.claimEntityId,
            toEntityName: claimText,
            stable: isStable,
          });
        }
        const blockClaimKey = `${blockId}:${claimId}`;
        if (!linkedBlockClaims.has(blockClaimKey)) {
          linkedBlockClaims.add(blockClaimKey);
          const statement = relate({
            fromEntity: blockRef,
            propertyId: DEBATE_CLAIMS_PROPERTY_ID,
            toEntityId: claimId,
            toEntityName: claimEntityText,
          });
          // When this statement was said, on the relation's own entity rather than the claim: a
          // claim stated in two turns has two moments. Typed Selector → Debate videos, the graph's
          // shape for "this relation points at a span of its target" (the one `Reply to` uses).
          // Only a measured span is written — the app reads these as a to-the-second certainty.
          // How much the claim carries the debate, on the same relation entity: like the offsets it
          // is a fact about this statement in this debate, not about the claim. Only a real score
          // is written — the player ranks by it, so a stand-in would rank. Like the offsets, it is
          // the FIRST extraction's for this (block, claim): two extractions in one turn that
          // resolve to one entity share one relation, and the later one's score is not consulted
          // even when the first had none.
          const highlightScore = publishableScore(claim.highlightScore);
          if (highlightScore !== null) {
            setFloat(statement.id, CLAIM_HIGHLIGHT_SCORE_PROPERTY_ID, highlightScore);
          }
          // The axes come from the same run and follow the same rules, each on its own: one the
          // scorer did not report is simply not written, the others still are.
          for (const [field, propertyId] of Object.entries(CLAIM_AXIS_SCORE_PROPERTY_IDS) as Array<
            [ClaimAxisScoreField, string]
          >) {
            const axisScore = publishableScore(claim[field]);
            if (axisScore !== null) setFloat(statement.id, propertyId, axisScore);
          }
          const timing = publishableTiming(claim.timing);
          if (timing) {
            setInteger(statement.id, CLAIM_START_OFFSET_PROPERTY_ID, timing.startMs);
            setInteger(statement.id, CLAIM_END_OFFSET_PROPERTY_ID, timing.endMs);
            relate({
              fromEntity: statement,
              propertyId: TYPES_PROPERTY_ID,
              toEntityId: SELECTOR_TYPE_ID,
              toEntityName: 'Selector',
            });
            relate({
              fromEntity: statement,
              propertyId: TARGET_PROPERTY_ID,
              toEntityId: DEBATE_VIDEOS_PROPERTY_ID,
              toEntityName: 'Debate videos',
            });
          }
        }
        if (!sourcedClaims.has(claimId)) {
          sourcedClaims.add(claimId);
          relate({
            fromEntity: claimRef,
            propertyId: SOURCES_PROPERTY_ID,
            toEntityId: debateEntityId,
            toEntityName: debateName,
            stable: isStable,
          });
        }
      }
    });
  }

  return { debateEntityId, debateName, values, relations };
}

/**
 * The UUIDv5 namespace for every other id the full debate publish mints. Fixed forever, like the
 * one below: changing it would re-derive the ids, and a republish would add second copies.
 */
const DEBATE_PUBLISH_ID_NAMESPACE = 'b8f4e0a2-5c1d-4e7a-9f3b-6d2c8a1e4f70';

/**
 * The id of one thing the full debate publish writes, derived from the Debate entity id and a key
 * naming the thing within that debate (`entity:transcript`, `relation:<from>:<property>:<to>`).
 * Same debate, same key, same id — which is what makes a republish an update rather than a copy.
 */
export function debatePublishId(debateEntityId: string, key: string): string {
  return normalizeId(uuidv5(`${normalizeId(debateEntityId)}:${key}`, DEBATE_PUBLISH_ID_NAMESPACE));
}

/**
 * The UUIDv5 namespace for the relations that describe a claim minted under geo-chat's stable id.
 * Fixed forever: changing it would re-derive every id, and the next publish would add second copies
 * of relations the graph already holds.
 */
const STABLE_CLAIM_RELATION_NAMESPACE = '6f1d2c8e-3b0a-4f57-9a61-2e870a0c1a1d';

/**
 * GEO-2870 option A. Deterministic ids for one relation describing a claim minted under geo-chat's
 * stable id (D1): its Types, its Debate tag, its Topics and its Sources edge to the Debate.
 *
 * A claim is now written twice — by the early claims publish minutes after extraction, and again by
 * the full debate publish — and the two writes must not leave two Types or two Tags relations on
 * the entity. The indexer keys relations on their id and upserts on conflict, so deriving the id
 * from (from, property, to) makes the second write an update of the first. It also makes an early
 * publish that ran twice (an overlapping sweep, a retry after an unconfirmed receipt) harmless.
 *
 * Only these relations: everything else in the debate edit is written by the full publish alone,
 * under ids derived from the debate ({@link debatePublishId}).
 */
export function stableClaimRelationIds(
  fromEntityId: string,
  propertyId: string,
  toEntityId: string
): { id: string; entityId: string } {
  const key = `${normalizeId(fromEntityId)}:${normalizeId(propertyId)}:${normalizeId(toEntityId)}`;
  return {
    id: normalizeId(uuidv5(`${key}:relation`, STABLE_CLAIM_RELATION_NAMESPACE)),
    entityId: normalizeId(uuidv5(`${key}:entity`, STABLE_CLAIM_RELATION_NAMESPACE)),
  };
}

export type DebateClaimsPublishInput = {
  /** The DAO space the debate will be published to (debate.claim.space_id, dashless). */
  spaceId: string;
  /**
   * The turns the claims attach to, as {@link DebatePublishInput.transcriptTurns}. Only used to
   * apply the full publish's own filter: a claim whose turn is missing or blank is never linked by
   * the full publish, so it is not published early either.
   */
  transcriptTurns: DebatePublishTurn[];
  /** The claims to describe. Only those under a stable id, with no graph reference, are written. */
  claims: DebateClaimInput[];
};

export type DebateClaimsPublishDraft = {
  /** The stable ids of the claims the draft writes, normalised, in the order they were said. */
  claimIds: string[];
  /** The first claim's text, for the edit's name. */
  firstClaimText: string | null;
  values: Value[];
  relations: Relation[];
};

/**
 * GEO-2870 option A: the early claims publish. Describes each claim minted under geo-chat's stable
 * id — Name, Types → Claim, Is factual, the Debate tag when contestable, and its Topics — so it
 * exists on the graph, and can be voted on and requested, long before the debate itself publishes.
 *
 * Writes nothing that names the debate: no transcript block, no Sources edge, no reference to the
 * Debate entity id. The full publish adds those, and its idempotency check is whether the Debate
 * entity exists, so this edit must never make it look as if it does.
 *
 * Exactly what {@link buildDebatePublishDraft} writes for the same claims, with the same relation
 * ids ({@link stableClaimRelationIds}) and the same first-statement-wins text, so the later full
 * publish rewrites these values and relations instead of duplicating them. Pure.
 */
export function buildDebateClaimsDraft(
  input: DebateClaimsPublishInput,
  options: Pick<BuildOptions, 'createPosition'> = {}
): DebateClaimsPublishDraft {
  const createPosition = options.createPosition ?? Position.generate;
  const values: Value[] = [];
  const relations: Relation[] = [];

  const relate = (
    fromEntity: { id: string; name: string | null },
    propertyId: string,
    to: { id: string; name: string | null }
  ) => {
    const ids = stableClaimRelationIds(fromEntity.id, propertyId, to.id);
    relations.push(
      makeRelation({
        id: ids.id,
        entityId: ids.entityId,
        position: createPosition(),
        spaceId: input.spaceId,
        propertyId,
        fromEntity,
        toEntityId: to.id,
        toEntityName: to.name,
      })
    );
  };

  // The full draft's order: turns in order (blank ones skipped), each turn's claims as given.
  const turns = input.transcriptTurns.filter(turn => turn.text.trim().length > 0);
  const claimsByTurnIndex = new Map<number, DebateClaimInput[]>();
  for (const claim of input.claims) {
    const list = claimsByTurnIndex.get(claim.turnIndex);
    if (list) list.push(claim);
    else claimsByTurnIndex.set(claim.turnIndex, [claim]);
  }

  const claimIds: string[] = [];
  const minted = new Set<string>();
  const tagged = new Set<string>();
  const topicEdges = new Set<string>();
  let firstClaimText: string | null = null;

  for (const turn of turns) {
    for (const claim of claimsByTurnIndex.get(turn.turnIndex) ?? []) {
      const text = claim.text.trim();
      if (text.length === 0) continue;
      if (claim.existingClaimEntityId?.trim()) continue;
      const stableId = claim.stableEntityId?.trim() || null;
      if (stableId === null) continue;
      const key = normalizeId(stableId);
      const claimRef = { id: stableId, name: text };

      if (!minted.has(key)) {
        minted.add(key);
        claimIds.push(key);
        firstClaimText ??= text;
        values.push(
          makeTextValue({
            entityId: stableId,
            entityName: text,
            propertyId: NAME_PROPERTY_ID,
            value: text,
            spaceId: input.spaceId,
          })
        );
        relate(claimRef, TYPES_PROPERTY_ID, { id: CLAIM_TYPE_ID, name: 'Claim' });
        if (claim.isFactual !== null) {
          values.push(
            makeBooleanValue({
              entityId: stableId,
              entityName: text,
              propertyId: CLAIM_IS_FACTUAL_PROPERTY_ID,
              value: claim.isFactual ? 'true' : 'false',
              spaceId: input.spaceId,
            })
          );
        }
      }
      if (claim.isContestable && !tagged.has(key)) {
        tagged.add(key);
        relate(claimRef, TAG_PROPERTY_ID, { id: DEBATE_TAG_ID, name: 'Debate' });
      }
      for (const topic of claim.topics ?? []) {
        const edge = `${key}:${normalizeId(topic.id)}`;
        if (topicEdges.has(edge)) continue;
        topicEdges.add(edge);
        relate(claimRef, TOPICS_PROPERTY_ID, { id: topic.id, name: topic.name });
      }
    }
  }

  return { claimIds, firstClaimText, values, relations };
}

/**
 * Merge consecutive same-speaker transcript segments into one turn, so the transcript
 * becomes a handful of turn blocks rather than hundreds of tiny Whisper segments.
 */
export function mergeTranscriptSegmentsIntoTurns(
  segments: Array<{ participantSlot: number; text: string }>,
  speakerBySlot: Map<number, { spaceEntityId: string; displayName: string | null }>
): DebatePublishTurn[] {
  const turns: DebatePublishTurn[] = [];
  for (const segment of segments) {
    const text = segment.text.trim();
    if (text.length === 0) continue;
    const speaker = speakerBySlot.get(segment.participantSlot);
    if (!speaker) continue;
    const last = turns[turns.length - 1];
    if (last && last.speakerSpaceEntityId === speaker.spaceEntityId) {
      last.text = `${last.text} ${text}`.trim();
    } else {
      turns.push({
        turnIndex: turns.length,
        speakerSpaceEntityId: speaker.spaceEntityId,
        speakerName: speaker.displayName,
        text,
      });
    }
  }
  return turns;
}

/**
 * A claim's span if it is a real interval of whole, non-negative milliseconds, else null. The
 * decoder already refuses anything else; this is the publisher refusing it too, because a bad
 * value here would be published as a certainty and nothing downstream can demote it.
 */
export function publishableTiming(timing: DebateClaimInput['timing']): { startMs: number; endMs: number } | null {
  if (!timing) return null;
  const { startMs, endMs } = timing;
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)) return null;
  if (startMs < 0 || endMs <= startMs) return null;
  return { startMs, endMs };
}

/**
 * A claim's highlight score or axis score if it is a finite number in [0, 1], else null. Same
 * stance as {@link publishableTiming}: the decoder refuses anything else already, and the publisher
 * refuses it again because a bad value here is ranked by, and nothing downstream can demote it.
 */
export function publishableScore(score: DebateClaimInput['highlightScore']): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score < 0 || score > 1) return null;
  return score;
}

/** Dashless, lower-case — the form ids are compared in, so one entity is one key. */
function normalizeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

const TEXT_DATA_TYPE: DataType = 'TEXT';

function makeTextValue({
  entityId,
  entityName,
  propertyId,
  value,
  spaceId,
}: {
  entityId: string;
  entityName: string | null;
  propertyId: string;
  value: string;
  spaceId: string;
}): Value {
  return {
    id: ID.createValueId({ entityId, propertyId, spaceId }),
    entity: { id: entityId, name: entityName },
    property: { id: propertyId, name: null, dataType: TEXT_DATA_TYPE },
    value,
    spaceId,
    isLocal: true,
    hasBeenPublished: false,
  };
}

const INTEGER_DATA_TYPE: DataType = 'INTEGER';

function makeIntegerValue({
  entityId,
  entityName,
  propertyId,
  value,
  spaceId,
}: {
  entityId: string;
  entityName: string | null;
  propertyId: string;
  value: number;
  spaceId: string;
}): Value {
  return {
    id: ID.createValueId({ entityId, propertyId, spaceId }),
    entity: { id: entityId, name: entityName },
    property: { id: propertyId, name: null, dataType: INTEGER_DATA_TYPE },
    value: String(value),
    spaceId,
    isLocal: true,
    hasBeenPublished: false,
  };
}

const FLOAT_DATA_TYPE: DataType = 'FLOAT';

function makeFloatValue({
  entityId,
  entityName,
  propertyId,
  value,
  spaceId,
}: {
  entityId: string;
  entityName: string | null;
  propertyId: string;
  value: number;
  spaceId: string;
}): Value {
  return {
    id: ID.createValueId({ entityId, propertyId, spaceId }),
    entity: { id: entityId, name: entityName },
    property: { id: propertyId, name: null, dataType: FLOAT_DATA_TYPE },
    value: String(value),
    spaceId,
    isLocal: true,
    hasBeenPublished: false,
  };
}

const BOOLEAN_DATA_TYPE: DataType = 'BOOLEAN';

function makeBooleanValue({
  entityId,
  entityName,
  propertyId,
  value,
  spaceId,
}: {
  entityId: string;
  entityName: string | null;
  propertyId: string;
  value: string;
  spaceId: string;
}): Value {
  return {
    id: ID.createValueId({ entityId, propertyId, spaceId }),
    entity: { id: entityId, name: entityName },
    property: { id: propertyId, name: null, dataType: BOOLEAN_DATA_TYPE },
    value,
    spaceId,
    isLocal: true,
    hasBeenPublished: false,
  };
}

function makeRelation({
  id,
  entityId,
  position,
  spaceId,
  propertyId,
  fromEntity,
  toEntityId,
  toEntityName,
}: {
  id: string;
  entityId: string;
  position: string;
  spaceId: string;
  propertyId: string;
  fromEntity: { id: string; name: string | null };
  toEntityId: string;
  toEntityName: string | null;
}): Relation {
  return {
    id,
    entityId,
    spaceId,
    renderableType: 'RELATION',
    verified: false,
    position,
    isLocal: true,
    hasBeenPublished: false,
    type: { id: propertyId, name: null },
    fromEntity,
    toEntity: { id: toEntityId, name: toEntityName, value: toEntityId },
  };
}
