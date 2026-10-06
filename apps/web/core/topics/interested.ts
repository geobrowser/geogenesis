import { type Hex, encodeFunctionData } from 'viem';

import { encodeEntityVoteData, encodeEntityVoteTopic } from '~/core/utils/contracts/entity-vote';
import { EMPTY_SIGNATURE, PERMISSIONLESS_ACTIONS, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';
import { normId } from '~/core/utils/norm-id';

import type { TopicRef } from './follow-ops';

/**
 * GEO-3158. Interested is a public response, vote kind 3, and on a topic it IS the topic follow.
 * It has a positive and a clear and nothing else; "not interested" is a separate private signal.
 */
export const INTERESTED_VOTE_KIND = 3;

/**
 * Whether topic follows are Interested instead of a `Following` relation. Off unless set, and off it
 * is exactly the relation-only behaviour from before. It exists because Interested only works once
 * `PERMISSIONLESS.INTERESTED` / `UNINTERESTED` are registered on the space registry; before that,
 * every follow would revert on chain.
 *
 * Read at call time, not captured in a module constant, so a test can flip it. Next inlines the
 * literal `process.env.NEXT_PUBLIC_…` either way.
 */
export function isInterestedFollowEnabled(): boolean {
  return process.env.NEXT_PUBLIC_INTERESTED_FOLLOW_ENABLED === 'true';
}

/** One held Interested, as read back from gaia's `user_votes`. */
export type InterestedTopicRow = {
  /** The topic. */
  objectId: string;
  /** The space the Interested was cast in. Clearing must name the same one. */
  spaceId: string;
};

/**
 * The read rule with the flag on: a topic is followed exactly when the space holds a current
 * Interested on it. A `Following` relation counts for nothing (Preston, 6 Oct: old topic follows are
 * dropped). Held in several spaces, it is still one followed topic.
 */
export function interestedTopicIds(interested: readonly Pick<InterestedTopicRow, 'objectId'>[]): Set<string> {
  return new Set(interested.map(row => normId(row.objectId)));
}

export type InterestedCall = { to: Hex; data: Hex };

/**
 * `SpaceRegistry.enter` calldata for an Interested or its clear on one entity. Same topic and data
 * encoding as every other response; only the action hash differs. The SDK has no `interested`
 * method yet, so this is built here rather than through `geo.responses`.
 */
export function encodeInterestedCall(args: {
  registry: Hex;
  authorSpaceId: string;
  spaceId: string;
  entityId: string;
  interested: boolean;
}): InterestedCall {
  const author = `0x${normId(args.authorSpaceId)}` as Hex;
  const space = `0x${normId(args.spaceId)}` as Hex;
  const action = args.interested ? PERMISSIONLESS_ACTIONS.INTERESTED : PERMISSIONLESS_ACTIONS.UNINTERESTED;
  const data = encodeFunctionData({
    abi: SpaceRegistryAbi,
    functionName: 'enter',
    args: [
      author,
      space,
      action,
      encodeEntityVoteTopic(args.entityId, 0),
      encodeEntityVoteData(args.authorSpaceId, args.spaceId),
      EMPTY_SIGNATURE,
    ],
  });
  return { to: args.registry, data };
}

/**
 * Interested calls for every topic not already followed, deduped within the input,
 * so a whole selection goes out as one user operation.
 *
 * Cast in the viewer's personal space, which is where their `Following` relations live: the space
 * a response is cast in is part of its key, so a fixed choice is what lets a later clear find it.
 */
export function buildInterestedFollowCalls(args: {
  registry: Hex;
  personalSpaceId: string;
  topics: readonly TopicRef[];
  followedTopicIds: ReadonlySet<string>;
}): { calls: InterestedCall[]; added: InterestedTopicRow[] } {
  const seen = new Set([...args.followedTopicIds].map(normId));
  const calls: InterestedCall[] = [];
  const added: InterestedTopicRow[] = [];

  for (const topic of args.topics) {
    const key = normId(topic.id);
    if (seen.has(key)) continue;
    seen.add(key);

    calls.push(
      encodeInterestedCall({
        registry: args.registry,
        authorSpaceId: args.personalSpaceId,
        spaceId: args.personalSpaceId,
        entityId: key,
        interested: true,
      })
    );
    added.push({ objectId: key, spaceId: normId(args.personalSpaceId) });
  }

  return { calls, added };
}

/**
 * A clear for every Interested held on the given topics, in whichever space it was cast, so one
 * written by another client or in another space goes too.
 */
export function buildInterestedClearCalls(args: {
  registry: Hex;
  personalSpaceId: string;
  rows: readonly InterestedTopicRow[];
  topicIds: readonly string[];
}): { calls: InterestedCall[]; cleared: InterestedTopicRow[] } {
  const targets = new Set(args.topicIds.map(normId));
  const cleared = args.rows.filter(row => targets.has(normId(row.objectId)));
  const calls = cleared.map(row =>
    encodeInterestedCall({
      registry: args.registry,
      authorSpaceId: args.personalSpaceId,
      spaceId: row.spaceId,
      entityId: row.objectId,
      interested: false,
    })
  );
  return { calls, cleared };
}
