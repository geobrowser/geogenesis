'use client';

import * as React from 'react';

import cx from 'classnames';

import { buildClaimDraft } from '~/core/claims/claim-draft';
import { TOPIC_TYPE_ID } from '~/core/claims/ontology';
import { SPACE_ACTIVITY_TYPE_ID, spaceActivityFeedEndpoint } from '~/core/space/space-debate-activity';
import { useDiff } from '~/core/state/diff-store';
import { useMutate } from '~/core/sync/use-mutate';

import { Button } from '~/design-system/button';
import { Plus } from '~/design-system/icons/plus';
import { SelectEntityCompact, type SelectEntityCompactResult } from '~/design-system/select-entity-compact';
import { Text } from '~/design-system/text';

import { EntityFeed } from '~/partials/feed/entity-feed';

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

/**
 * A space's claims, as the browse feed a reader arrives at from Overview's Activity card.
 *
 * This was a fixed list of up to fifty claims in whatever order the entity store happened to hold
 * them, on a route the space's own tab bar does not link to. It is now the destination of "See all
 * claims", so it has to answer the question that link asks — what is worth reading here — which
 * means **Best order and no floor on how far you can scroll**, the same two properties the debates
 * feed on the sibling route already has.
 *
 * So the list is the Explore feed, pinned to this space and to Claim, exactly as the Activity card
 * above it is. One consequence worth knowing: like Explore, it shows the claims a curator has
 * tagged `Debate` (GEO-2835) rather than every claim in the space. That is what the card's count is
 * measured through too, so the number on the pill and the list it leads to are the same corpus.
 *
 * The staging form stays. It is unrelated to how the list is ordered, and it is the only place in
 * the app that opens a claim proposal from a space. What it no longer does is show the staged claim
 * in the list below before it is published — the feed reads the graph, not the local edit store —
 * and staging already opens the review panel, which is where a draft lives until it is published.
 */
export function ClaimsPageClient({ spaceId }: ClaimsPageClientProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  // A fixed one-element list, memoised so the feed's query key is stable across renders.
  const lockedTypeIds = React.useMemo(() => [SPACE_ACTIVITY_TYPE_ID.claims], []);

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
        <EntityFeed
          apiEndpoint={spaceActivityFeedEndpoint(spaceId)}
          lockedSpaceId={spaceId}
          lockedTypeIds={lockedTypeIds}
          initialSort="best"
          showSortFilter
          // "All time" rather than Explore's month: one space holds far less than the whole graph,
          // and a window narrow enough to be interesting across every space can empty a single one.
          initialTime="all"
          // The presentation Explore and the Activity card above this both give a claim, so it is
          // answerable in the same shape wherever it is read.
          claimCardVariant="debate-panel-mobile"
          feedTopSpacingClassName="mt-5"
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
