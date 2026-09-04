'use client';

import * as React from 'react';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import type { ParticipantPosition } from './participant-positions';
import { usePersonPositions } from './use-person-debate-stats';

export type PersonClaimTopic = { id: string; name: string | null };

export type PersonClaimEntry = {
  claimId: string;
  claimHex: string;
  spaceIds: string[];
  positions: ParticipantPosition[];
};

export type PersonClaimsData = {
  positions: ParticipantPosition[] | undefined;
  entries: PersonClaimEntry[];
  claimByHex: Map<string, Entity>;
  topicsByClaimHex: Map<string, PersonClaimTopic[]>;
  isLoading: boolean;
};

/**
 * The person's positioned claims, their entities, and the topics those claims carry.
 */
export function usePersonClaims(personId: string): PersonClaimsData {
  const { data: positions, isLoading } = usePersonPositions(personId);

  const entries = React.useMemo<PersonClaimEntry[]>(() => {
    const byHex = new Map<string, PersonClaimEntry>();
    for (const position of positions ?? []) {
      const claimHex = uuidToHex(position.claimId);
      const spaceHex = uuidToHex(position.spaceId);
      const existing = byHex.get(claimHex);
      if (existing) {
        existing.positions.push(position);
        if (!existing.spaceIds.includes(spaceHex)) existing.spaceIds.push(spaceHex);
      } else {
        byHex.set(claimHex, { claimId: position.claimId, claimHex, spaceIds: [spaceHex], positions: [position] });
      }
    }
    return [...byHex.values()];
  }, [positions]);

  const claimIds = React.useMemo(() => entries.map(entry => entry.claimId), [entries]);
  const { entities: claimEntities } = useQueryEntities({
    where: { id: { in: claimIds }, types: [{ id: { equals: CLAIM_TYPE_ID } }] },
    first: Math.max(claimIds.length, 1),
    enabled: claimIds.length > 0,
  });

  const claimByHex = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const claim of claimEntities) map.set(uuidToHex(claim.id), claim);
    return map;
  }, [claimEntities]);

  const topicsByClaimHex = React.useMemo(() => {
    const map = new Map<string, PersonClaimTopic[]>();
    for (const [hex, claim] of claimByHex) {
      const topics = claim.relations
        .filter(relation => relation.isDeleted !== true && idEquals(relation.type.id, TOPICS_PROPERTY_ID))
        .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name }));
      if (topics.length > 0) map.set(hex, topics);
    }
    return map;
  }, [claimByHex]);

  return { positions, entries, claimByHex, topicsByClaimHex, isLoading };
}

/** Distinct topics across the person's claims, sorted by name — the topic filter's options. */
export function personTopics(topicsByClaimHex: Map<string, PersonClaimTopic[]>): PersonClaimTopic[] {
  const seen = new Map<string, PersonClaimTopic>();
  for (const topics of topicsByClaimHex.values()) {
    for (const topic of topics) {
      const key = uuidToHex(topic.id);
      if (!seen.has(key)) seen.set(key, topic);
    }
  }
  return [...seen.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}
