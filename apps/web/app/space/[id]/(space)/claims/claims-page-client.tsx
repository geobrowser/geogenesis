'use client';

import * as React from 'react';

import cx from 'classnames';

import { buildClaimDraft } from '~/core/claims/claim-draft';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/claims/ontology';
import { isClaimPublishedInSpace } from '~/core/claims/publish';
import { claimResponseKind } from '~/core/claims/response-kind';
import type { DebateClaim } from '~/core/debates/api';
import { DebateEntityResponseControls } from '~/core/debates/debate-entity-response-controls';
import { useBackfillReadinessForHeldPosition } from '~/core/debates/backfill-readiness-for-held-position';
import { useRetireConfirmedResponseIndexing } from '~/core/debates/retire-confirmed-response-indexing';
import { useDebateClaims } from '~/core/debates/hooks';
import {
  ClaimResponseBatchBoundary,
  useClaimResponseSummaryBatch,
} from '~/core/responses/use-claim-response-summaries';
import { useDiff } from '~/core/state/diff-store';
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
  const [formOpen, setFormOpen] = React.useState(false);
  const { entities: claims, isLoading } = useQueryEntities({
    where: {
      spaces: [{ equals: spaceId }],
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
    },
    first: 50,
    deferUntilFetched: true,
    includeUnpublishedLocal: true,
  });
  // Scoped to this space. `useQueryEntities` filters *which* entities come back, not each one's
  // relations — rows materialize through a bare `store.getEntity(id)` — so the unscoped predicate
  // reads a draft edit sitting in any other space and reports the claim unpublished here.
  const isPublishedHere = React.useCallback((claim: Entity) => isClaimPublishedInSpace(claim, spaceId), [spaceId]);
  const publishedClaimIds = React.useMemo(
    () => claims.filter(isPublishedHere).map(claim => claim.id),
    [claims, isPublishedHere]
  );
  const debateClaimsQuery = useDebateClaims(spaceId, publishedClaimIds, true);
  const debateClaimsByEntityId = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const claim of debateClaimsQuery.data?.claims ?? []) {
      map.set(claim.claim_entity_id, claim);
    }
    return map;
  }, [debateClaimsQuery.data?.claims]);
  const responseKindsByEntityId = React.useMemo(
    () =>
      new Map(
        claims
          .filter(isPublishedHere)
          .map(claim => [
            claim.id,
            debateClaimsByEntityId.get(claim.id)?.response_kind ?? claimResponseKind(claim, spaceId),
          ])
      ),
    [claims, debateClaimsByEntityId, isPublishedHere, spaceId]
  );
  const responseTargets = React.useMemo(
    () => publishedClaimIds.map(entityId => ({ entityId, responseKind: responseKindsByEntityId.get(entityId)! })),
    [publishedClaimIds, responseKindsByEntityId]
  );
  const responseBatch = useClaimResponseSummaryBatch({
    spaceId,
    targets: responseTargets,
    enabled: true,
  });
  const responseBatchReady = responseTargets.length === 0 || responseBatch.isSuccess;
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
        <ClaimResponseBatchBoundary ready={responseBatchReady}>
          {responseBatch.isError ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white px-5 py-3">
              <Text color="grey-04">Response data could not be loaded.</Text>
              <Button type="button" variant="secondary" onClick={() => void responseBatch.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}
          <ClaimsList
            claims={claims}
            isLoading={isLoading}
            spaceId={spaceId}
            debateClaimsByEntityId={debateClaimsByEntityId}
            responseKindsByEntityId={responseKindsByEntityId}
            debateStatus={debateClaimsQuery.error instanceof Error ? debateClaimsQuery.error.message : null}
          />
        </ClaimResponseBatchBoundary>
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
  debateClaimsByEntityId,
  responseKindsByEntityId,
  debateStatus,
}: {
  claims: Entity[];
  isLoading: boolean;
  spaceId: string;
  debateClaimsByEntityId: Map<string, DebateClaim>;
  responseKindsByEntityId: Map<string, 'stance' | 'veracity'>;
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
      {debateStatus && (
        <div className="rounded-lg border border-red-01 bg-white px-5 py-3">
          <Text color="red-01">{debateStatus}</Text>
        </div>
      )}
      {claims.map(claim => (
        <ClaimListItem
          key={claim.id}
          claim={claim}
          spaceId={spaceId}
          debateClaim={debateClaimsByEntityId.get(claim.id) ?? null}
          responseKind={responseKindsByEntityId.get(claim.id) ?? claimResponseKind(claim, spaceId)}
        />
      ))}
    </div>
  );
}

function ClaimListItem({
  claim,
  spaceId,
  debateClaim,
  responseKind,
}: {
  claim: Entity;
  spaceId: string;
  debateClaim: DebateClaim | null;
  responseKind: 'stance' | 'veracity';
}) {
  const topics = relationsForProperty(claim.relations, TOPICS_PROPERTY_ID);
  const published = isClaimPublishedInSpace(claim, spaceId);
  // Kept when the Debate toggle went (GEO-2740): the toggle drew this side effect, but the
  // snapshot it retires is what drives the notification that now creates readiness server-side.
  useRetireConfirmedResponseIndexing({ debateClaim, entityId: claim.id, spaceId });
  // Catches up readiness for a position the viewer already held before GEO-2740. Temporary; see
  // the hook.
  useBackfillReadinessForHeldPosition({ debateClaim, entityId: claim.id, spaceId });

  return (
    <article className="rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
      <div className="min-w-0">
        <Text as="h3" variant="bodySemibold" color="text" className="block">
          {claim.name ?? claim.id}
        </Text>

        {!published && (
          <Text as="p" variant="body" color="grey-04" className="mt-2">
            Publish this claim before starting a debate.
          </Text>
        )}
      </div>

      {published && (
        <div className="mt-3 flex items-center gap-4">
          <DebateEntityResponseControls entityId={claim.id} spaceId={spaceId} responseKind={responseKind} />
        </div>
      )}

      <ClaimDebateStatus debateClaim={debateClaim} published={published} />

      {topics.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <RelationChipGroup label="Topics" relations={topics} />
        </div>
      )}
    </article>
  );
}

function ClaimDebateStatus({ debateClaim, published }: { debateClaim: DebateClaim | null; published: boolean }) {
  if (!published) return null;

  if (debateClaim?.active_debate) {
    return (
      <Text as="p" variant="body" color="grey-04" className="mt-3">
        Debate {debateClaim.active_debate.status.replace('_', ' ')}
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
