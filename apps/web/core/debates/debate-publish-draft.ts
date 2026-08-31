import { Position } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import type { DataType, Relation, Value } from '~/core/types';

import {
  AUTHORS_PROPERTY_ID,
  BLOCKS_PROPERTY_ID,
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_PARTICIPANTS_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TRANSCRIPTS_PROPERTY_ID,
  DEBATE_TYPE_ID,
  DEBATE_VIDEOS_PROPERTY_ID,
  IMAGE_TYPE_ID,
  IMAGE_URL_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
  MARKDOWN_CONTENT_PROPERTY_ID,
  NAME_PROPERTY_ID,
  SOURCES_PROPERTY_ID,
  TEXT_BLOCK_TYPE_ID,
  TRANSCRIPT_TYPE_ID,
  TYPES_PROPERTY_ID,
  VIDEO_TYPE_ID,
  VIDEO_URL_PROPERTY_ID,
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
};

export type DebatePublishInput = {
  /** geo-chat debate UUID (with dashes). Becomes the Debate entity id, dashless. */
  debateId: string;
  /** The DAO space the debate is published to (debate.claim.space_id, dashless). */
  spaceId: string;
  /** The already-published Claim entity the debate argued. */
  claimEntityId: string;
  claimText: string;
  participants: DebatePublishParticipant[];
  /**
   * `ipfs://` URI for the rendered final video, or null to skip the Video entity. Goes on-chain,
   * so it has to outlive geo-chat's presigned object-store URLs.
   */
  videoUrl: string | null;
  /** `ipfs://` URI for the video's poster still, or null to publish the Video without one. */
  keyframeUrl: string | null;
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
  const createEntityId = options.createEntityId ?? ID.createEntityId;
  const createPosition = options.createPosition ?? Position.generate;

  const claimText = input.claimText.trim();
  if (claimText.length === 0) throw new Error('Debate claim text is required.');
  if (input.participants.length === 0) throw new Error('A debate needs participants to publish.');

  const debateEntityId = ID.uuidToHex(input.debateId);
  const bySlot = [...input.participants].sort((a, b) => a.participantSlot - b.participantSlot);
  const nameFor = (p: DebatePublishParticipant) => (p.displayName?.trim() ? p.displayName.trim() : 'Anonymous');
  const debateName = `${bySlot.map(nameFor).join(' vs. ')} on ${claimText}`;

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
  }: {
    fromEntity: { id: string; name: string | null };
    propertyId: string;
    toEntityId: string;
    toEntityName: string | null;
  }) => {
    relations.push(
      makeRelation({
        id: createEntityId(),
        entityId: createEntityId(),
        position: createPosition(),
        spaceId: input.spaceId,
        propertyId,
        fromEntity,
        toEntityId,
        toEntityName,
      })
    );
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

  // --- Video entity (+ its Key frame Image) ---
  if (input.videoUrl) {
    const videoId = createEntityId();
    const videoName = `${debateName} video`;
    const videoRef = { id: videoId, name: videoName };
    setText(videoId, videoName, NAME_PROPERTY_ID, videoName);
    // Both carry the same ipfs:// URI: `Video URL` is what the debates ontology spec names,
    // `IPFS URL` is what the relation decoder actually reads.
    setText(videoId, videoName, VIDEO_URL_PROPERTY_ID, input.videoUrl);
    setText(videoId, videoName, IMAGE_URL_PROPERTY_ID, input.videoUrl);
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
      const keyframeId = createEntityId();
      const keyframeName = `${debateName} keyframe`;
      const keyframeRef = { id: keyframeId, name: keyframeName };
      setText(keyframeId, keyframeName, NAME_PROPERTY_ID, keyframeName);
      setText(keyframeId, keyframeName, IMAGE_URL_PROPERTY_ID, input.keyframeUrl);
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
    const transcriptId = createEntityId();
    const transcriptName = `${debateName} transcript`;
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

    turns.forEach(turn => {
      const speakerName = turn.speakerName?.trim() ? turn.speakerName.trim() : 'Anonymous';
      const blockId = createEntityId();
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
      for (const claim of claimsByTurnIndex.get(turn.turnIndex) ?? []) {
        const claimEntityText = claim.text.trim();
        if (claimEntityText.length === 0) continue;
        const claimId = createEntityId();
        const claimRef = { id: claimId, name: claimEntityText };
        setText(claimId, claimEntityText, NAME_PROPERTY_ID, claimEntityText);
        relate({ fromEntity: claimRef, propertyId: TYPES_PROPERTY_ID, toEntityId: CLAIM_TYPE_ID, toEntityName: 'Claim' });
        if (claim.isFactual !== null) {
          setBoolean(claimId, claimEntityText, CLAIM_IS_FACTUAL_PROPERTY_ID, claim.isFactual);
        }
        relate({
          fromEntity: blockRef,
          propertyId: DEBATE_CLAIMS_PROPERTY_ID,
          toEntityId: claimId,
          toEntityName: claimEntityText,
        });
        relate({
          fromEntity: claimRef,
          propertyId: SOURCES_PROPERTY_ID,
          toEntityId: debateEntityId,
          toEntityName: debateName,
        });
      }
    });
  }

  return { debateEntityId, debateName, values, relations };
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
