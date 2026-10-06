import { decodeFunctionData } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PERMISSIONLESS_ACTIONS, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';

import {
  buildInterestedClearCalls,
  buildInterestedFollowCalls,
  encodeInterestedCall,
  isInterestedFollowEnabled,
  mergeFollowedTopicIds,
} from './interested';

const REGISTRY = '0xCF13491802747e759e1BB8E364bc43045398d1DD';
const ME = '11111111111111111111111111111111';
const OTHER_SPACE = '44444444444444444444444444444444';
const TOPIC_A = '22222222222222222222222222222222';
const TOPIC_B = '33333333333333333333333333333333';
const TOPIC_A_DASHED = '22222222-2222-2222-2222-222222222222';

function decode(data: `0x${string}`) {
  const { functionName, args } = decodeFunctionData({ abi: SpaceRegistryAbi, data });
  const [from, to, action, topic] = args as readonly [string, string, string, string, string, string];
  return { functionName, from, to, action, topic };
}

describe('isInterestedFollowEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_INTERESTED_FOLLOW_ENABLED', '');
    expect(isInterestedFollowEnabled()).toBe(false);
  });

  it('is on only for the exact string "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_INTERESTED_FOLLOW_ENABLED', '1');
    expect(isInterestedFollowEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_INTERESTED_FOLLOW_ENABLED', 'true');
    expect(isInterestedFollowEnabled()).toBe(true);
  });
});

describe('mergeFollowedTopicIds (the read rule)', () => {
  it('reads a topic as followed through a Following relation alone', () => {
    expect(mergeFollowedTopicIds([{ toEntityId: TOPIC_A }], [])).toEqual(new Set([TOPIC_A]));
  });

  it('reads a topic as followed through Interested alone', () => {
    expect(mergeFollowedTopicIds([], [{ objectId: TOPIC_B }])).toEqual(new Set([TOPIC_B]));
  });

  it('counts a topic held both ways once, whatever the id spelling', () => {
    const ids = mergeFollowedTopicIds([{ toEntityId: TOPIC_A_DASHED }], [{ objectId: TOPIC_A }]);
    expect(ids).toEqual(new Set([TOPIC_A]));
  });

  it('reads nothing as followed with neither', () => {
    expect(mergeFollowedTopicIds([], []).size).toBe(0);
  });
});

describe('encodeInterestedCall', () => {
  it('calls SpaceRegistry.enter with the INTERESTED hash and the entity topic', () => {
    const call = encodeInterestedCall({
      registry: REGISTRY,
      authorSpaceId: ME,
      spaceId: ME,
      entityId: TOPIC_A_DASHED,
      interested: true,
    });
    expect(call.to).toBe(REGISTRY);
    const decoded = decode(call.data);
    expect(decoded.functionName).toBe('enter');
    expect(decoded.from).toBe(`0x${ME}`);
    expect(decoded.to).toBe(`0x${ME}`);
    expect(decoded.action).toBe(PERMISSIONLESS_ACTIONS.INTERESTED);
    expect(decoded.topic).toBe(`0x00000000${TOPIC_A}${'0'.repeat(24)}`);
  });

  it('clears with UNINTERESTED', () => {
    const call = encodeInterestedCall({
      registry: REGISTRY,
      authorSpaceId: ME,
      spaceId: OTHER_SPACE,
      entityId: TOPIC_A,
      interested: false,
    });
    const decoded = decode(call.data);
    expect(decoded.action).toBe(PERMISSIONLESS_ACTIONS.UNINTERESTED);
    expect(decoded.to).toBe(`0x${OTHER_SPACE}`);
  });
});

describe('buildInterestedFollowCalls', () => {
  it('writes one Interested per new topic, in the personal space, deduped', () => {
    const { calls, added } = buildInterestedFollowCalls({
      registry: REGISTRY,
      personalSpaceId: ME,
      topics: [{ id: TOPIC_A }, { id: TOPIC_A_DASHED }, { id: TOPIC_B }],
      followedTopicIds: new Set(),
    });
    expect(calls).toHaveLength(2);
    expect(added).toEqual([
      { objectId: TOPIC_A, spaceId: ME },
      { objectId: TOPIC_B, spaceId: ME },
    ]);
    expect(calls.map(call => decode(call.data).action)).toEqual([
      PERMISSIONLESS_ACTIONS.INTERESTED,
      PERMISSIONLESS_ACTIONS.INTERESTED,
    ]);
  });

  it('skips a topic already followed by a Following relation or Interested', () => {
    const { calls } = buildInterestedFollowCalls({
      registry: REGISTRY,
      personalSpaceId: ME,
      topics: [{ id: TOPIC_A }, { id: TOPIC_B }],
      followedTopicIds: mergeFollowedTopicIds([{ toEntityId: TOPIC_A_DASHED }], [{ objectId: TOPIC_B }]),
    });
    expect(calls).toHaveLength(0);
  });
});

describe('buildInterestedClearCalls', () => {
  it('clears every Interested held on the topic, in the space each was cast', () => {
    const { calls, cleared } = buildInterestedClearCalls({
      registry: REGISTRY,
      personalSpaceId: ME,
      rows: [
        { objectId: TOPIC_A, spaceId: ME },
        { objectId: TOPIC_A, spaceId: OTHER_SPACE },
        { objectId: TOPIC_B, spaceId: ME },
      ],
      topicIds: [TOPIC_A_DASHED],
    });
    expect(cleared).toHaveLength(2);
    expect(calls.map(call => decode(call.data).to)).toEqual([`0x${ME}`, `0x${OTHER_SPACE}`]);
    expect(calls.every(call => decode(call.data).action === PERMISSIONLESS_ACTIONS.UNINTERESTED)).toBe(true);
  });

  it('has nothing to clear for a topic followed only through a relation', () => {
    const { calls } = buildInterestedClearCalls({
      registry: REGISTRY,
      personalSpaceId: ME,
      rows: [],
      topicIds: [TOPIC_A],
    });
    expect(calls).toHaveLength(0);
  });
});
