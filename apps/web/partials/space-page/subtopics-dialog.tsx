'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSubspace } from '~/core/hooks/use-subspace';
import { useSubtopicSearch } from '~/core/hooks/use-subtopic-search';
import { useSubtopics } from '~/core/hooks/use-subtopics';
import type { SubtopicSearchResult } from '~/core/io/subgraph/fetch-subtopic-search';
import type { TopicUsage } from '~/core/io/subgraph/topic-space-usage';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Text } from '~/design-system/text';
import { Truncate } from '~/design-system/truncate';

interface SubtopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

type SpaceUsage = {
  id: string;
  image: string;
};

type PendingAction = 'adding' | 'removing';

const ACTION_BUTTON_CLASSNAME =
  'h-6 rounded-[6px] border border-grey-02 bg-white px-[7px] pb-[2px] pt-px text-metadata text-text shadow-light transition duration-200 ease-in-out hover:border-text hover:bg-bg focus:border-text focus:shadow-inner-text focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50';

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

function SubtopicActionButton({
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

function SubtopicRow({
  name,
  spaces,
  spacesCount,
  actionLabel,
  disabled,
  onAction,
}: {
  name: string | null;
  spaces: SpaceUsage[];
  spacesCount: number;
  actionLabel: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-[62px] items-start justify-between gap-2 rounded-[8px] bg-white py-3">
      <div className="flex w-[250px] flex-col gap-[6px]">
        <p className="text-[17px] leading-[19px] tracking-[-0.17px] text-text">{name ?? 'Untitled'}</p>
        <AssociatedSpacesMeta count={spacesCount} spaces={spaces} />
      </div>
      <div className="pt-0.5">
        <SubtopicActionButton label={actionLabel} disabled={disabled} onClick={onAction} />
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
  result: SubtopicSearchResult;
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
          {result.description && (
            <Truncate maxLines={2} shouldTruncate variant="footnote">
              <Text variant="footnote" color="grey-04">
                {result.description}
              </Text>
            </Truncate>
          )}
          <div className={result.description ? 'pt-1.5' : 'pt-0.5'}>
            <AssociatedSpacesMeta count={result.spacesCount} spaces={result.spaces} />
          </div>
        </div>
      </div>
      <div className="pt-0.5">
        <SubtopicActionButton label={actionLabel} disabled={disabled} onClick={onAction} />
      </div>
    </div>
  );
}

export function SubtopicsDialog({ open, onOpenChange, spaceId }: SubtopicsDialogProps) {
  // Avoid mounting hooks (and firing queries) when the dialog is closed
  if (!open) return null;

  return <SubtopicsDialogContent open={open} onOpenChange={onOpenChange} spaceId={spaceId} />;
}

function SubtopicsDialogContent({ open, onOpenChange, spaceId }: SubtopicsDialogProps) {
  const { query, onQueryChange, results, isLoading } = useSubtopicSearch();
  const queryClient = useQueryClient();
  const {
    data: subtopics,
    isLoading: isSubtopicsLoading,
    isError: isSubtopicsError,
    error: subtopicsError,
  } = useSubtopics(spaceId);
  const { setSubspace, unsetSubspace } = useSubspace({ spaceId });
  const [pendingTopicIds, setPendingTopicIds] = React.useState<Map<string, PendingAction>>(new Map());
  const subtopicsQueryKey = ['subtopics', spaceId];

  const subtopicIds = React.useMemo(() => new Set(subtopics.map(subtopic => subtopic.id)), [subtopics]);
  const filteredResults = React.useMemo(
    () => results.filter(result => !subtopicIds.has(result.id)),
    [results, subtopicIds]
  );

  const sortSubtopics = React.useCallback(
    (topics: TopicUsage[]) => [...topics].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const addSubtopic = async (result: SubtopicSearchResult) => {
    const optimisticEntry: TopicUsage = {
      id: result.id,
      name: result.name ?? 'Untitled',
      spaces: result.spaces,
      spacesCount: result.spacesCount,
    };

    await queryClient.cancelQueries({ queryKey: subtopicsQueryKey });

    queryClient.setQueryData<TopicUsage[]>(subtopicsQueryKey, current => {
      const currentSubtopics = current ?? [];
      const alreadyExists = currentSubtopics.some(subtopic => subtopic.id === result.id);

      if (alreadyExists) {
        return currentSubtopics;
      }

      return sortSubtopics([...currentSubtopics, optimisticEntry]);
    });

    setPendingTopicIds(prev => new Map(prev).set(result.id, 'adding'));
    onQueryChange('');

    setSubspace(
      {
        subspaceId: spaceId,
        relationType: 'subtopic',
        topicEntityId: result.id,
      },
      {
        onSuccess: () => {
          setPendingTopicIds(prev => {
            const next = new Map(prev);
            next.delete(result.id);
            return next;
          });
        },
        onError: () => {
          queryClient.setQueryData<TopicUsage[]>(subtopicsQueryKey, current => {
            if (!current) return current;
            return current.filter(subtopic => subtopic.id !== result.id);
          });

          setPendingTopicIds(prev => {
            const next = new Map(prev);
            next.delete(result.id);
            return next;
          });
        },
      }
    );
  };

  const removeSubtopic = async (topicId: string) => {
    await queryClient.cancelQueries({ queryKey: subtopicsQueryKey });

    setPendingTopicIds(prev => new Map(prev).set(topicId, 'removing'));

    unsetSubspace(
      {
        subspaceId: spaceId,
        relationType: 'subtopic',
        topicEntityId: topicId,
      },
      {
        onSuccess: () => {
          queryClient.setQueryData<TopicUsage[]>(subtopicsQueryKey, current => {
            if (!current) return current;
            return current.filter(subtopic => subtopic.id !== topicId);
          });
        },
        onSettled: () => {
          setPendingTopicIds(prev => {
            const next = new Map(prev);
            next.delete(topicId);
            return next;
          });
        },
      }
    );
  };

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
                    Subtopics
                  </Text>
                </Title>
                <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <Text variant="metadata" as="p">
                  Add a subtopic
                </Text>
                <div className="relative">
                  <Input
                    withSearchIcon
                    placeholder="Search..."
                    value={query}
                    onChange={e => onQueryChange(e.target.value)}
                  />
                  {query && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[12px] border border-grey-02 bg-white shadow-lg">
                      <ResizableContainer duration={0.15}>
                        <div className="max-h-[240px] overflow-y-auto p-1">
                          {isLoading && (
                            <div className="flex h-12 items-center justify-center">
                              <Dots />
                            </div>
                          )}
                          {!isLoading && query && filteredResults.length === 0 && (
                            <div className="px-3 py-2 text-button text-grey-04">No results found</div>
                          )}
                          {!isLoading &&
                            filteredResults.map((result, i) => (
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
                                    actionLabel="Add subtopic"
                                    disabled={pendingTopicIds.has(result.id)}
                                    onAction={() => void addSubtopic(result)}
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
            </div>

            <div className="flex flex-col gap-2 pb-4">
              <Text variant="metadata" as="p">
                Current subtopics
              </Text>

              {isSubtopicsLoading && (
                <div className="flex h-12 items-center justify-center">
                  <Dots />
                </div>
              )}

              {!isSubtopicsLoading && isSubtopicsError && (
                <div className="px-3 py-2 text-button text-grey-04">
                  {subtopicsError instanceof Error ? subtopicsError.message : 'Unable to load subtopics'}
                </div>
              )}

              {!isSubtopicsLoading && !isSubtopicsError && (!subtopics || subtopics.length === 0) && (
                <div className="px-3 py-2 text-button text-grey-04">No subtopics declared yet</div>
              )}

              {!isSubtopicsLoading &&
                !isSubtopicsError &&
                subtopics?.map(subtopic => (
                  <div key={subtopic.id}>
                    <div className="h-px w-full bg-divider" />
                    <SubtopicRow
                      name={subtopic.name}
                      spaces={subtopic.spaces}
                      spacesCount={subtopic.spacesCount}
                      actionLabel={
                        pendingTopicIds.get(subtopic.id) === 'adding'
                          ? 'Adding...'
                          : pendingTopicIds.get(subtopic.id) === 'removing'
                            ? 'Removing...'
                            : 'Remove'
                      }
                      disabled={pendingTopicIds.has(subtopic.id)}
                      onAction={() => void removeSubtopic(subtopic.id)}
                    />
                  </div>
                ))}
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
