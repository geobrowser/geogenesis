'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { buildClaimDraft } from '~/core/claims/claim-draft';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims, useJoinDebateQueue } from '~/core/debates/hooks';
import { useDiff } from '~/core/state/diff-store';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';

import { Button } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';
import { SelectEntityCompact, type SelectEntityCompactResult } from '~/design-system/select-entity-compact';
import { Text } from '~/design-system/text';

type ClaimsPageClientProps = {
  spaceId: string;
};

type RelatedSelectionKey = 'topics';

type RelatedField = {
  key: RelatedSelectionKey;
  label: string;
  placeholder: string;
  typeId: string;
};

const relatedFields: RelatedField[] = [
  {
    key: 'topics',
    label: 'Topics',
    placeholder: 'Search topics...',
    typeId: TOPIC_TYPE_ID,
  },
];

export function ClaimsPageClient({ spaceId }: ClaimsPageClientProps) {
  const claimsAndDebatesEnabled = useFeatureFlag('questionsTab');
  const router = useRouter();

  React.useEffect(() => {
    if (!claimsAndDebatesEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [claimsAndDebatesEnabled, router, spaceId]);

  if (!claimsAndDebatesEnabled) return null;

  return <ClaimsTabSurface spaceId={spaceId} debatesEnabled={claimsAndDebatesEnabled} />;
}

function ClaimsTabSurface({ spaceId, debatesEnabled }: ClaimsPageClientProps & { debatesEnabled: boolean }) {
  const [formOpen, setFormOpen] = React.useState(false);
  const { entities: claims, isLoading } = useQueryEntities({
    where: {
      spaces: [{ equals: spaceId }],
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
    },
    first: 50,
    placeholderData: keepPreviousData,
    includeUnpublishedLocal: true,
  });
  const publishedClaimIds = React.useMemo(() => claims.filter(isClaimPublished).map(claim => claim.id), [claims]);
  const debateClaimsQuery = useDebateClaims(spaceId, publishedClaimIds, debatesEnabled);
  const debateClaimsByEntityId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const claim of debateClaimsQuery.data?.claims ?? []) {
      map.set(claim.claim_entity_id, claim);
    }
    return map;
  }, [debateClaimsQuery.data?.claims]);
  const activeMatches = React.useMemo(
    () => (debateClaimsQuery.data?.claims ?? []).flatMap(claim => (claim.active_match ? [claim.active_match] : [])),
    [debateClaimsQuery.data?.claims]
  );
  return (
    <div className="py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="smallTitle" color="text">
          Claims
        </Text>
        {!formOpen && (
          <Button type="button" variant="secondary" icon={<Plus />} onClick={() => setFormOpen(true)}>
            Add claim
          </Button>
        )}
      </div>

      {formOpen && <AddClaimForm spaceId={spaceId} onCancel={() => setFormOpen(false)} />}

      <div className={cx(formOpen && 'mt-6')}>
        <ClaimsList
          claims={claims}
          isLoading={isLoading}
          spaceId={spaceId}
          debatesEnabled={debatesEnabled}
          debateJoinBlocked={activeMatches.length > 0}
          debateClaimsByEntityId={debateClaimsByEntityId}
          debateStatus={debateClaimsQuery.error instanceof Error ? debateClaimsQuery.error.message : null}
        />
      </div>
    </div>
  );
}

function AddClaimForm({ spaceId, onCancel }: { spaceId: string; onCancel: () => void }) {
  const { storage } = useMutate();
  const { setActiveSpace, bumpReviewVersion, setIsReviewOpen } = useDiff();
  const [claimText, setClaimText] = React.useState('');
  const [topics, setTopics] = React.useState<SelectEntityCompactResult[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const selectionsByKey = {
    topics,
  };

  const setSelectionsByKey = {
    topics: setTopics,
  };

  const addSelection = (key: RelatedSelectionKey, selection: SelectEntityCompactResult) => {
    setSelectionsByKey[key](current => {
      if (current.some(item => item.id === selection.id)) return current;
      return [...current, selection];
    });
  };

  const removeSelection = (key: RelatedSelectionKey, id: string) => {
    setSelectionsByKey[key](current => current.filter(item => item.id !== id));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const draft = buildClaimDraft({
        spaceId,
        claimText,
        topics,
      });

      for (const name of draft.names) {
        storage.entities.name.set(name.entityId, name.spaceId, name.value);
      }

      for (const relation of draft.relations) {
        storage.relations.set(relation);
      }

      setActiveSpace(spaceId);
      bumpReviewVersion();
      setIsReviewOpen(true);
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stage the claim.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-grey-02 bg-white p-5 shadow-light">
      <div className="space-y-4">
        <label className="block">
          <Text as="span" variant="metadataMedium" color="text">
            Claim
          </Text>
          <textarea
            value={claimText}
            onChange={event => setClaimText(event.target.value)}
            rows={3}
            className="mt-2 block w-full resize-y rounded-md border border-grey-02 bg-white px-3 py-2 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
            placeholder="What should this space decide?"
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          {relatedFields.map(field => (
            <div key={field.key} className="min-w-0">
              <Text as="div" variant="metadataMedium" color="text" className="mb-2">
                {field.label}
              </Text>
              <SelectEntityCompact
                spaceId={spaceId}
                placeholder={field.placeholder}
                relationValueTypes={[{ id: field.typeId }]}
                selected={selectionsByKey[field.key]}
                onDone={selection => addSelection(field.key, selection)}
                onRemoveSelected={id => removeSelection(field.key, id)}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <Text as="p" variant="body" color="red-01" className="mt-4">
          {error}
        </Text>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Open proposal</Button>
      </div>
    </form>
  );
}

function ClaimsList({
  claims,
  isLoading,
  spaceId,
  debatesEnabled,
  debateJoinBlocked,
  debateClaimsByEntityId,
  debateStatus,
}: {
  claims: Entity[];
  isLoading: boolean;
  spaceId: string;
  debatesEnabled: boolean;
  debateJoinBlocked: boolean;
  debateClaimsByEntityId: Map<string, DebateClaim>;
  debateStatus: string | null;
}) {
  if (isLoading && claims.length === 0) {
    return (
      <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
        <Text color="grey-04">Loading claims...</Text>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
        <Text as="h3" variant="bodySemibold" color="text">
          No claims yet
        </Text>
        <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[560px]">
          Add a claim to stage it as an edit, then publish it through Review edits.
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {debateStatus && debatesEnabled && (
        <div className="rounded-lg border border-red-01 bg-white px-5 py-3">
          <Text color="red-01">{debateStatus}</Text>
        </div>
      )}
      {claims.map(claim => (
        <ClaimListItem
          key={claim.id}
          claim={claim}
          spaceId={spaceId}
          debatesEnabled={debatesEnabled}
          debateJoinBlocked={debateJoinBlocked}
          debateClaim={debateClaimsByEntityId.get(claim.id) ?? null}
        />
      ))}
    </div>
  );
}

function ClaimListItem({
  claim,
  spaceId,
  debatesEnabled,
  debateJoinBlocked,
  debateClaim,
}: {
  claim: Entity;
  spaceId: string;
  debatesEnabled: boolean;
  debateJoinBlocked: boolean;
  debateClaim: DebateClaim | null;
}) {
  const topics = relationsForProperty(claim.relations, TOPICS_PROPERTY_ID);
  const published = isClaimPublished(claim);
  const joinQueue = useJoinDebateQueue(spaceId);
  const activeMatch = debateClaim?.active_match ?? null;
  const activeDebate = debateClaim?.active_debate ?? null;
  const mutationError = joinQueue.error instanceof Error ? joinQueue.error.message : null;

  const joinPosition = (position: boolean) => {
    joinQueue.mutate({
      claimId: claim.id,
      request: {
        position,
      },
    });
  };

  return (
    <article className="rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
      <div className="min-w-0">
        <Text as="h3" variant="bodySemibold" color="text" className="block">
          {claim.name ?? claim.id}
        </Text>

        {!published && debatesEnabled && (
          <Text as="p" variant="body" color="grey-04" className="mt-2">
            Publish this claim before starting a debate.
          </Text>
        )}
      </div>

      <PositionButtonGroup
        debatesEnabled={debatesEnabled}
        canJoinDebate={published && !activeDebate && !activeMatch && !debateJoinBlocked}
        pendingPosition={debateClaim?.viewer_waiting_position ?? null}
        joinPending={joinQueue.isPending}
        onJoinPosition={joinPosition}
        className="mt-3"
      />

      {debatesEnabled && (
        <ClaimDebateStatus debateClaim={debateClaim} mutationError={mutationError} published={published} />
      )}

      {topics.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <RelationChipGroup label="Topics" relations={topics} />
        </div>
      )}
    </article>
  );
}

function PositionButtonGroup({
  debatesEnabled,
  canJoinDebate,
  pendingPosition,
  joinPending,
  onJoinPosition,
  className,
}: {
  debatesEnabled: boolean;
  canJoinDebate: boolean;
  pendingPosition: boolean | null;
  joinPending: boolean;
  onJoinPosition: (position: boolean) => void;
  className?: string;
}) {
  const positions = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];

  return (
    <div className={className}>
      <Text as="div" variant="metadataMedium" color="grey-04" className="mb-1">
        Position
      </Text>
      <div className="flex flex-wrap gap-1.5">
        {positions.map(position => {
          if (debatesEnabled) {
            return (
              <Button
                key={position.label}
                type="button"
                variant="secondary"
                small
                onClick={() => onJoinPosition(position.value)}
                disabled={!canJoinDebate || joinPending || pendingPosition === position.value}
              >
                {position.label}
              </Button>
            );
          }

          return (
            <span
              key={position.label}
              className="inline-flex max-w-full items-center rounded-md border border-grey-02 bg-bg px-2 py-1 text-[0.8125rem] text-text"
            >
              <span className="truncate">{position.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ClaimDebateStatus({
  debateClaim,
  mutationError,
  published,
}: {
  debateClaim: DebateClaim | null;
  mutationError: string | null;
  published: boolean;
}) {
  if (mutationError) {
    return (
      <Text as="p" variant="body" color="red-01" className="mt-3">
        {mutationError}
      </Text>
    );
  }

  if (!published) return null;

  if (debateClaim?.active_debate) {
    return (
      <Text as="p" variant="body" color="grey-04" className="mt-3">
        Debate {debateClaim.active_debate.status.replace('_', ' ')}
      </Text>
    );
  }

  if (debateClaim?.active_match) {
    return (
      <Text as="p" variant="body" color="grey-04" className="mt-3">
        Match found. Both speakers need to accept.
      </Text>
    );
  }

  if (debateClaim?.viewer_waiting_position !== null && debateClaim?.viewer_waiting_position !== undefined) {
    return (
      <Text as="p" variant="body" color="grey-04" className="mt-3">
        Waiting for someone with the opposite position.
      </Text>
    );
  }

  return null;
}

function RelationChipGroup({
  label,
  relations,
  className,
}: {
  label: string;
  relations: Relation[];
  className?: string;
}) {
  if (relations.length === 0) return null;

  return (
    <div className={className}>
      <Text as="div" variant="metadataMedium" color="grey-04" className="mb-1">
        {label}
      </Text>
      <div className="flex flex-wrap gap-1.5">
        {relations.map(relation => (
          <span
            key={relation.id}
            className="inline-flex max-w-full items-center rounded-md border border-grey-02 bg-bg px-2 py-1 text-[0.8125rem] text-text"
          >
            <span className="truncate">{relation.toEntity.name ?? relation.toEntity.id}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function relationsForProperty(relations: Relation[], propertyId: string): Relation[] {
  return relations.filter(relation => relation.type.id === propertyId && relation.isDeleted !== true);
}

function isClaimPublished(claim: Entity): boolean {
  return !claim.relations.some(relation => relation.isLocal && relation.hasBeenPublished !== true);
}
