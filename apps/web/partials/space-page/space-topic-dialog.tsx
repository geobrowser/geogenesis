'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { usePendingSpaceTopicProposals } from '~/core/hooks/use-pending-space-topic-proposals';
import { useSpace } from '~/core/hooks/use-space';
import { useSpaceTopic } from '~/core/hooks/use-space-topic';
import { useSpaceTopicPanel } from '~/core/hooks/use-space-topic-panel';
import { useSpaceTopicSearch } from '~/core/hooks/use-space-topic-search';
import type { PendingSpaceTopicProposal } from '~/core/io/subgraph/fetch-pending-space-topic-proposals';
import type { SpaceTopicSearchResult } from '~/core/io/subgraph/fetch-space-topic-search';
import type { SpaceTopic } from '~/core/io/subgraph/fetch-space-topic';
import { NavUtils } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

interface SpaceTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

type SpaceUsage = {
  id: string;
  image: string;
};

type PendingAction = 'setting';

const ACTION_BUTTON_CLASSNAME =
  'h-6 rounded-[6px] border border-grey-02 bg-white px-[7px] pb-[2px] pt-px text-metadata text-text shadow-light transition duration-200 ease-in-out hover:border-text hover:bg-bg focus:border-text focus:shadow-inner-text focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50';

function SpaceTopicDialogShell({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-100 flex items-start justify-center focus:outline-hidden">
          <div className="mt-32 flex w-[460px] flex-col gap-4 overflow-visible rounded-xl bg-white px-4 pt-4 shadow-lg">
            <div className="flex flex-col">
              <div className="flex items-start justify-between">
                <Title asChild>
                  <Text variant="smallTitle" as="h2">
                    Topic
                  </Text>
                </Title>
                <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
              </div>

              <div className="mt-4 flex flex-col gap-4">{children}</div>
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}

function StackedSpaceAvatars({ spaces }: { spaces: SpaceUsage[] }) {
  if (spaces.length === 0) return null;

  return (
    <div className="flex items-center pr-1">
      {spaces.slice(0, 3).map(space => (
        <div key={space.id} className="-mr-1 size-3 overflow-hidden rounded-[4px] first:mr-0">
          <NativeGeoImage
            value={space.image || PLACEHOLDER_SPACE_IMAGE}
            alt=""
            className="block size-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function AssociatedSpacesMeta({ count, spaces }: { count: number; spaces: SpaceUsage[] }) {
  const copy = count === 0 ? 'No associated spaces' : `${count} associated ${pluralize('space', count)}`;

  return (
    <div className="flex items-center gap-2">
      <StackedSpaceAvatars spaces={spaces} />
      <span className="text-[16px] leading-[13px] tracking-[-0.35px] text-grey-04">{copy}</span>
    </div>
  );
}

function TopicActionButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} className={ACTION_BUTTON_CLASSNAME} onClick={onClick}>
      {label}
    </button>
  );
}

function TopicDisplayRow({ topic }: { topic: SpaceTopic }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5">
      <div className="mt-0.5 size-[22px] shrink-0 overflow-clip rounded-sm">
        <NativeGeoImage
          value={topic.image || PLACEHOLDER_SPACE_IMAGE}
          alt=""
          width={22}
          height={22}
          className="h-[22px] w-[22px] object-cover"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-button text-text">{topic.name ?? 'Untitled'}</span>
        {topic.description ? (
          <Truncate maxLines={2} shouldTruncate variant="footnote">
            <Text variant="footnote" color="grey-04">
              {topic.description}
            </Text>
          </Truncate>
        ) : null}
        <div className={topic.description ? 'pt-1.5' : 'pt-0.5'}>
          <AssociatedSpacesMeta count={topic.spacesCount} spaces={topic.spaces} />
        </div>
      </div>
    </div>
  );
}

function SearchResultRow({
  result,
  actionLabel,
  disabled,
  onAction,
}: {
  result: SpaceTopicSearchResult;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <div className="mt-0.5 size-[22px] shrink-0 overflow-clip rounded-sm">
          <NativeGeoImage
            value={result.image || PLACEHOLDER_SPACE_IMAGE}
            alt=""
            width={22}
            height={22}
            className="h-[22px] w-[22px] object-cover"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-button text-text">{result.name ?? 'Untitled'}</span>
          {result.description ? (
            <Truncate maxLines={2} shouldTruncate variant="footnote">
              <Text variant="footnote" color="grey-04">
                {result.description}
              </Text>
            </Truncate>
          ) : null}
          <div className={result.description ? 'pt-1.5' : 'pt-0.5'}>
            <AssociatedSpacesMeta count={result.spacesCount} spaces={result.spaces} />
          </div>
        </div>
      </div>
      <div className="pt-0.5">
        <TopicActionButton label={actionLabel} disabled={disabled} onClick={onAction} />
      </div>
    </div>
  );
}

export function SpaceTopicDialog({ open, onOpenChange, spaceId }: SpaceTopicDialogProps) {
  const { space, isLoading } = useSpace(spaceId);

  if (!open || isLoading || !space) return null;

  if (space.type === 'DAO') {
    return <DaoSpaceTopicDialog open={open} onOpenChange={onOpenChange} spaceId={spaceId} />;
  }

  return <PersonalSpaceTopicDialog open={open} onOpenChange={onOpenChange} spaceId={spaceId} />;
}

function PersonalSpaceTopicDialog({ open, onOpenChange, spaceId }: SpaceTopicDialogProps) {
  const { query, onQueryChange, results, isLoading } = useSpaceTopicSearch();
  const queryClient = useQueryClient();
  const { data: currentTopic, isLoading: isCurrentTopicLoading, isError, error } = useSpaceTopicPanel(spaceId, open);
  const { setTopic } = useSpaceTopic({ spaceId });
  const [pendingTopicIds, setPendingTopicIds] = React.useState<Map<string, PendingAction>>(new Map());
  const currentTopicQueryKey = ['space-topic', spaceId];

  const filteredResults = React.useMemo(
    () => results.filter(result => result.id !== currentTopic?.id),
    [results, currentTopic?.id]
  );

  const setSpaceTopic = async (result: SpaceTopicSearchResult) => {
    const optimisticTopic: SpaceTopic = {
      id: result.id,
      name: result.name ?? 'Untitled',
      description: result.description,
      image: result.image,
      spaces: result.spaces,
      spacesCount: result.spacesCount,
    };

    const previousTopic = queryClient.getQueryData<SpaceTopic | null>(currentTopicQueryKey) ?? null;

    await queryClient.cancelQueries({ queryKey: currentTopicQueryKey });
    queryClient.setQueryData(currentTopicQueryKey, optimisticTopic);
    setPendingTopicIds(prev => new Map(prev).set(result.id, 'setting'));
    onQueryChange('');

    setTopic(
      { topicEntityId: result.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: currentTopicQueryKey });
          queryClient.invalidateQueries({ queryKey: ['space', spaceId] });
        },
        onError: () => {
          queryClient.setQueryData(currentTopicQueryKey, previousTopic);
        },
        onSettled: () => {
          setPendingTopicIds(prev => {
            const next = new Map(prev);
            next.delete(result.id);
            return next;
          });
        },
      }
    );
  };

  return (
    <SpaceTopicDialogShell open={open} onOpenChange={onOpenChange}>
      <TopicSearchDropdown
        label="Set topic"
        query={query}
        onQueryChange={onQueryChange}
        results={filteredResults}
        isSearchLoading={isLoading}
        pendingTopicIds={pendingTopicIds}
        actionLabel="Set topic"
        onAdd={result => void setSpaceTopic(result)}
      />

      <CurrentTopicSection
        topic={currentTopic}
        isLoading={isCurrentTopicLoading}
        isError={isError}
        error={error}
      />
    </SpaceTopicDialogShell>
  );
}

function DaoSpaceTopicDialog({ open, onOpenChange, spaceId }: SpaceTopicDialogProps) {
  const { query, onQueryChange, results, isLoading } = useSpaceTopicSearch();
  const queryClient = useQueryClient();
  const { data: currentTopic, isLoading: isCurrentTopicLoading, isError, error } = useSpaceTopicPanel(spaceId, open);
  const { data: pendingProposals, isLoading: isPendingLoading } = usePendingSpaceTopicProposals(spaceId, open);
  const { setTopic } = useSpaceTopic({ spaceId });
  const [pendingTopicIds, setPendingTopicIds] = React.useState<Map<string, PendingAction>>(new Map());

  const excludedTopicIds = React.useMemo(() => {
    const ids = new Set<string>();

    if (currentTopic?.id) {
      ids.add(currentTopic.id);
    }

    for (const proposal of pendingProposals ?? []) {
      ids.add(proposal.topicId);
    }

    return ids;
  }, [currentTopic?.id, pendingProposals]);

  const filteredResults = React.useMemo(
    () => results.filter(result => !excludedTopicIds.has(result.id)),
    [results, excludedTopicIds]
  );

  const proposeTopic = (result: SpaceTopicSearchResult) => {
    setPendingTopicIds(prev => new Map(prev).set(result.id, 'setting'));
    onQueryChange('');

    setTopic(
      { topicEntityId: result.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['pending-space-topic-proposals', spaceId] });
        },
        onSettled: () => {
          setPendingTopicIds(prev => {
            const next = new Map(prev);
            next.delete(result.id);
            return next;
          });
        },
      }
    );
  };

  return (
    <SpaceTopicDialogShell open={open} onOpenChange={onOpenChange}>
      <TopicSearchDropdown
        label="Propose topic"
        query={query}
        onQueryChange={onQueryChange}
        results={filteredResults}
        isSearchLoading={isLoading}
        pendingTopicIds={pendingTopicIds}
        actionLabel="Propose"
        onAdd={proposeTopic}
      />

      <CurrentTopicSection
        topic={currentTopic}
        isLoading={isCurrentTopicLoading}
        isError={isError}
        error={error}
      />

      <PendingTopicProposalsSection proposals={pendingProposals ?? []} isLoading={isPendingLoading} />
    </SpaceTopicDialogShell>
  );
}

function TopicSearchDropdown({
  label,
  query,
  onQueryChange,
  results,
  isSearchLoading,
  pendingTopicIds,
  actionLabel,
  onAdd,
}: {
  label: string;
  query: string;
  onQueryChange: (query: string) => void;
  results: SpaceTopicSearchResult[];
  isSearchLoading: boolean;
  pendingTopicIds: Map<string, PendingAction>;
  actionLabel: string;
  onAdd: (result: SpaceTopicSearchResult) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Text variant="metadata" as="p">
        {label}
      </Text>
      <div className="relative">
        <Input withSearchIcon placeholder="Search..." value={query} onChange={e => onQueryChange(e.target.value)} />
        {query && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[12px] border border-grey-02 bg-white shadow-lg">
            <ResizableContainer duration={0.15}>
              <div className="max-h-[240px] overflow-y-auto p-1">
                {isSearchLoading && (
                  <div className="flex h-12 items-center justify-center">
                    <Dots />
                  </div>
                )}
                {!isSearchLoading && query && results.length === 0 && (
                  <div className="px-3 py-2 text-button text-grey-04">No results found</div>
                )}
                {!isSearchLoading &&
                  results.map((result, i) => (
                    <motion.div
                      key={result.id}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.02 * i }}
                    >
                      <div>
                        {i > 0 && <div className="h-px w-full bg-divider" />}
                        <SearchResultRow
                          result={result}
                          actionLabel={pendingTopicIds.has(result.id) ? 'Setting...' : actionLabel}
                          disabled={pendingTopicIds.has(result.id)}
                          onAction={() => onAdd(result)}
                        />
                      </div>
                    </motion.div>
                  ))}
              </div>
            </ResizableContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function CurrentTopicSection({
  topic,
  isLoading,
  isError,
  error,
}: {
  topic: SpaceTopic | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  return (
    <div className="flex flex-col gap-2 pb-4">
      <Text variant="metadata" as="p">
        Current topic
      </Text>

      {isLoading && (
        <div className="flex h-12 items-center justify-center">
          <Dots />
        </div>
      )}

      {!isLoading && isError && (
        <div className="px-3 py-2 text-button text-grey-04">
          {error instanceof Error ? error.message : 'Unable to load topic'}
        </div>
      )}

      {!isLoading && !isError && !topic && <div className="px-3 py-2 text-button text-grey-04">No topic set yet</div>}

      {!isLoading && !isError && topic && (
        <div>
          <div className="h-px w-full bg-divider" />
          <TopicDisplayRow topic={topic} />
        </div>
      )}
    </div>
  );
}

function PendingTopicProposalsSection({
  proposals,
  isLoading,
}: {
  proposals: PendingSpaceTopicProposal[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pb-4">
        <Text variant="metadata" as="p">
          Pending proposals
        </Text>
        <div className="flex h-12 items-center justify-center">
          <Dots />
        </div>
      </div>
    );
  }

  if (proposals.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pb-4">
      <Text variant="metadata" as="p">
        Pending proposals
      </Text>
      {proposals.map(proposal => (
        <PendingTopicProposalRow key={proposal.proposalId} proposal={proposal} />
      ))}
    </div>
  );
}

function PendingTopicProposalRow({ proposal }: { proposal: PendingSpaceTopicProposal }) {
  const actionLabel = proposal.direction === 'remove' ? 'Remove' : 'Set';

  return (
    <div>
      <div className="h-px w-full bg-divider" />
      <Link
        href={NavUtils.toProposal(proposal.spaceId, proposal.proposalId)}
        className="flex flex-col gap-1 py-3 transition-opacity hover:opacity-80"
      >
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="mt-0.5 size-[22px] shrink-0 overflow-clip rounded-sm">
            <NativeGeoImage
              value={proposal.topicImage || PLACEHOLDER_SPACE_IMAGE}
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px] object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <Text variant="button" as="p">
                {proposal.name}
              </Text>
              <span
                className={`shrink-0 rounded-sm px-1 py-0.5 text-tag ${
                  proposal.direction === 'remove' ? 'bg-red-01/10 text-red-01' : 'bg-green/10 text-green'
                }`}
              >
                {actionLabel}
              </span>
            </div>
            {proposal.topicDescription ? (
              <Truncate maxLines={2} shouldTruncate variant="footnote">
                <Text variant="footnote" color="grey-04">
                  {proposal.topicDescription}
                </Text>
              </Truncate>
            ) : null}
            <div className={proposal.topicDescription ? 'pt-1.5' : 'pt-0.5'}>
              <AssociatedSpacesMeta count={proposal.spacesCount} spaces={proposal.spaces} />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
