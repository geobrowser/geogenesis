'use client';

import * as React from 'react';

import { DebateRow, type DebateSide, type WinnerShare, relationTargets } from '~/core/claims/browse/claim-debates';
import { useDebateKeyframes } from '~/core/claims/browse/use-debate-keyframes';
import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
} from '~/core/debates/ontology';
import { type PersonClaimTopic, personTopics, usePersonClaims } from '~/core/debates/use-person-claims';
import { usePersonDebates, usePersonPositions } from '~/core/debates/use-person-debate-stats';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import { useQueryEntities } from '~/core/sync/use-store';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { ALL_FILTER, PersonDebateFilters } from './person-debate-filters';

/**
 * Every debate the person argued, either side.
 * Renders nothing when there are no debates, per the empty-section rule.
 */
export function PersonDebatesCollection({
  personId,
  winnerShares,
}: {
  personId: string;
  winnerShares: Map<string, WinnerShare>;
}) {
  const debatesQuery = usePersonDebates(personId);
  const debateIds = React.useMemo(() => (debatesQuery.data ?? []).map(debate => debate.debateId), [debatesQuery.data]);

  const { entities: debates } = useQueryEntities({
    where: { id: { in: debateIds }, types: [{ id: { equals: DEBATE_TYPE_ID } }] },
    first: Math.max(debateIds.length, 1),
    enabled: debateIds.length > 0,
  });

  const sidesByDebateId = React.useMemo(() => {
    const map = new Map<string, DebateSide[]>();
    for (const debate of debates) {
      map.set(debate.id, [
        ...relationTargets(debate.relations, DEBATE_SUPPORTED_BY_PROPERTY_ID).map(id => ({
          spaceId: id,
          position: true,
        })),
        ...relationTargets(debate.relations, DEBATE_OPPOSED_BY_PROPERTY_ID).map(id => ({
          spaceId: id,
          position: false,
        })),
      ]);
    }
    return map;
  }, [debates]);

  const participantSpaceIds = React.useMemo(
    () => [...new Set([...sidesByDebateId.values()].flat().map(side => side.spaceId))],
    [sidesByDebateId]
  );
  const { profilesBySpaceId } = useProfilesBySpaceIds(participantSpaceIds, participantSpaceIds.length > 0);

  // How each debate's sides are labelled — Agree/Disagree or Verify/Dispute — read from the axis the
  // person answered the argued claim on.
  const { data: positions } = usePersonPositions(personId);
  const responseKindByClaimId = React.useMemo(() => {
    const map = new Map<string, 'stance' | 'veracity'>();
    for (const position of positions ?? []) map.set(uuidToHex(position.claimId), position.responseKind);
    return map;
  }, [positions]);
  const responseKindByDebateId = React.useMemo(() => {
    const map = new Map<string, 'stance' | 'veracity'>();
    for (const debate of debates) {
      const claimId = relationTargets(debate.relations, DEBATE_CLAIMS_PROPERTY_ID)[0];
      const kind = claimId ? responseKindByClaimId.get(uuidToHex(claimId)) : undefined;
      if (kind) map.set(debate.id, kind);
    }
    return map;
  }, [debates, responseKindByClaimId]);

  const keyframeByDebateId = useDebateKeyframes(debates);

  // Space and Topic filters, matching the Claims collection. Space is the debate's own resolved
  // space; Topic is the argued claim's topics, reused from `usePersonClaims`' cache.
  const [selectedSpace, setSelectedSpace] = React.useState(ALL_FILTER);
  const [selectedTopic, setSelectedTopic] = React.useState(ALL_FILTER);

  const { topicsByClaimHex } = usePersonClaims(personId);

  const spaceByDebateId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const debate of debates) map.set(debate.id, resolveEntitySpaceId(debate, personId));
    return map;
  }, [debates, personId]);

  const topicsByDebateId = React.useMemo(() => {
    const map = new Map<string, PersonClaimTopic[]>();
    for (const debate of debates) {
      const claimId = relationTargets(debate.relations, DEBATE_CLAIMS_PROPERTY_ID)[0];
      const topics = claimId ? topicsByClaimHex.get(uuidToHex(claimId)) : undefined;
      if (topics && topics.length > 0) map.set(debate.id, topics);
    }
    return map;
  }, [debates, topicsByClaimHex]);

  const spaceIds = React.useMemo(() => [...new Set(spaceByDebateId.values())], [spaceByDebateId]);
  const topics = React.useMemo(() => personTopics(topicsByDebateId), [topicsByDebateId]);

  const visible = React.useMemo(
    () =>
      debates.filter(debate => {
        if (selectedSpace !== ALL_FILTER && !idEquals(spaceByDebateId.get(debate.id) ?? '', selectedSpace)) {
          return false;
        }
        if (selectedTopic !== ALL_FILTER) {
          const debateTopics = topicsByDebateId.get(debate.id) ?? [];
          if (!debateTopics.some(topic => idEquals(topic.id, selectedTopic))) return false;
        }
        return true;
      }),
    [debates, spaceByDebateId, topicsByDebateId, selectedSpace, selectedTopic]
  );

  if (debateIds.length === 0) {
    if (debatesQuery.isLoading) return <Skeleton className="h-[120px] w-full rounded-lg" />;
    return null;
  }
  if (debates.length === 0) return <Skeleton className="h-[120px] w-full rounded-lg" />;

  return (
    <section aria-label="Debates">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="mediumTitle" color="text">
          Debates
        </Text>
        <PersonDebateFilters
          spaceIds={spaceIds}
          topics={topics}
          selectedSpace={selectedSpace}
          selectedTopic={selectedTopic}
          onSelectSpace={setSelectedSpace}
          onSelectTopic={setSelectedTopic}
        />
      </div>

      {visible.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          No debates match these filters.
        </Text>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {visible.map(debate => (
            <li key={debate.id}>
              <DebateRow
                debate={debate}
                spaceId={spaceByDebateId.get(debate.id) ?? personId}
                sides={sidesByDebateId.get(debate.id) ?? []}
                profilesBySpaceId={profilesBySpaceId}
                winnerShare={winnerShares.get(uuidToHex(debate.id)) ?? null}
                keyframeUrl={keyframeByDebateId.get(debate.id) ?? null}
                responseKind={responseKindByDebateId.get(debate.id) ?? 'stance'}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
