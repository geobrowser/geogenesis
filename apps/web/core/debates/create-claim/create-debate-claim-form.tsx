'use client';

import * as React from 'react';

import { TOPIC_TYPE_ID } from '~/core/claims/ontology';
import { useCreatableSpaceIds } from '~/core/hooks/use-creatable-space-ids';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { Button } from '~/design-system/button';
import { SelectEntityCompact, type SelectEntityCompactResult } from '~/design-system/select-entity-compact';
import { Text } from '~/design-system/text';

import { HubFilterMenu, type HubFilterOption } from '../matchmaking/hub-filter-menu';
import { usePublishDebateClaim } from './use-publish-debate-claim';

export type CreateDebateClaimResult = {
  claimId: string;
  spaceId: string;
  /** The claim already existed in the space and was surfaced rather than created a second time. */
  alreadyExisted: boolean;
};

type Props = {
  candidateSpaceIds: string[] | null | undefined;
  defaultSpaceId?: string | null;
  onCreated: (result: CreateDebateClaimResult) => void;
  onCancel: () => void;
};

/**
 * Create a claim inline and publish it straight into the chosen space — no review-edits flow.
 */
export function CreateDebateClaimForm({ candidateSpaceIds, defaultSpaceId, onCreated, onCancel }: Props) {
  const { publishClaim } = usePublishDebateClaim();

  const candidates = React.useMemo(() => candidateSpaceIds ?? [], [candidateSpaceIds]);
  const { canCreateInSpace, isResolved: creatableResolved } = useCreatableSpaceIds(candidates, true);
  const creatableSpaceIds = React.useMemo(() => candidates.filter(canCreateInSpace), [candidates, canCreateInSpace]);
  const { labelsById } = useSpaceLabels(creatableSpaceIds);

  const [claimText, setClaimText] = React.useState('');
  const [spaceId, setSpaceId] = React.useState<string | null>(null);
  const [topics, setTopics] = React.useState<SelectEntityCompactResult[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (spaceId || creatableSpaceIds.length === 0) return;
    const preferred =
      defaultSpaceId && creatableSpaceIds.includes(defaultSpaceId) ? defaultSpaceId : creatableSpaceIds[0];
    setSpaceId(preferred);
  }, [creatableSpaceIds, defaultSpaceId, spaceId]);

  const spaceOptions = React.useMemo<HubFilterOption<string>[]>(
    () =>
      creatableSpaceIds.map(id => {
        const label = spaceLabel(labelsById, id);
        return { value: id, label: label?.name ?? 'Space', image: label?.image ?? null };
      }),
    [creatableSpaceIds, labelsById]
  );

  const addTopic = (selection: SelectEntityCompactResult) =>
    setTopics(current => (current.some(topic => topic.id === selection.id) ? current : [...current, selection]));
  const removeTopic = (id: string) => setTopics(current => current.filter(topic => topic.id !== id));

  const canSubmit = claimText.trim().length > 0 && Boolean(spaceId) && !submitting;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!spaceId || claimText.trim().length === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const topicSelections = topics.map(topic => ({ id: topic.id, name: topic.name ?? null }));
      const result = await publishClaim({ spaceId, claimText, topics: topicSelections });
      onCreated({ claimId: result.claimId, spaceId, alreadyExisted: result.alreadyExisted });
    } catch {
      setError('Could not create the claim. Please try again.');
      setSubmitting(false);
    }
  };

  // No creatable space among the candidates — say so instead of an empty dropdown.
  const noCreatableSpaces = candidates.length === 0 || (creatableResolved && creatableSpaceIds.length === 0);

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-grey-02 bg-white p-4 shadow-light">
      <div className="space-y-4">
        <label className="block">
          <Text as="span" variant="metadataMedium" color="text">
            Claim
          </Text>
          <textarea
            value={claimText}
            onChange={event => setClaimText(event.target.value)}
            rows={3}
            autoFocus
            className="mt-2 block w-full resize-y rounded-md border border-grey-02 bg-white px-3 py-2 text-body text-text shadow-inner shadow-grey-02 outline-hidden placeholder:text-grey-03 focus:shadow-inner-lg focus:shadow-text"
            placeholder="What should people debate?"
          />
        </label>

        <div>
          <Text as="div" variant="metadataMedium" color="text" className="mb-2">
            Space
          </Text>
          {noCreatableSpaces ? (
            <Text as="p" variant="footnote" color="grey-04">
              You don’t have a space you can publish a claim to yet.
            </Text>
          ) : (
            <HubFilterMenu
              label={
                spaceId ? (spaceOptions.find(option => option.value === spaceId)?.label ?? 'Space') : 'Choose a space'
              }
              options={spaceOptions}
              value={spaceId ?? ''}
              onChange={setSpaceId}
            />
          )}
        </div>

        {spaceId ? (
          <div>
            <Text as="div" variant="metadataMedium" color="text" className="mb-2">
              Topics <span className="text-grey-03">(optional)</span>
            </Text>
            <SelectEntityCompact
              spaceId={spaceId}
              placeholder="Search topics..."
              relationValueTypes={[{ id: TOPIC_TYPE_ID }]}
              selected={topics}
              onDone={addTopic}
              onRemoveSelected={removeTopic}
            />
          </div>
        ) : null}
      </div>

      {error && (
        <Text as="p" variant="footnote" color="red-01" className="mt-3">
          {error}
        </Text>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create claim'}
        </Button>
      </div>
    </form>
  );
}
