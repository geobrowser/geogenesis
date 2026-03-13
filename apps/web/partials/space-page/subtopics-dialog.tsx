'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';

import { useSubspace } from '~/core/hooks/use-subspace';
import { useSubtopics } from '~/core/hooks/use-subtopics';
import { useSearch } from '~/core/hooks/use-search';

import { SquareButton } from '~/design-system/button';
import { Dots } from '~/design-system/dots';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Text } from '~/design-system/text';

interface SubtopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}

export function SubtopicsDialog({ open, onOpenChange, spaceId }: SubtopicsDialogProps) {
  // Avoid mounting hooks (and firing queries) when the dialog is closed
  if (!open) return null;

  return <SubtopicsDialogContent open={open} onOpenChange={onOpenChange} spaceId={spaceId} />;
}

function SubtopicsDialogContent({ open, onOpenChange, spaceId }: SubtopicsDialogProps) {
  const { query, onQueryChange, results, isLoading } = useSearch();
  const queryClient = useQueryClient();
  const {
    data: subtopics,
    isLoading: isSubtopicsLoading,
    isError: isSubtopicsError,
    error: subtopicsError,
  } = useSubtopics(spaceId);
  const { setSubspace, setStatus, unsetSubspace, unsetStatus } = useSubspace({ spaceId });
  const [removingTopicId, setRemovingTopicId] = React.useState<string | null>(null);

  const isAdding = setStatus === 'pending';
  const isRemoving = unsetStatus === 'pending';
  const isBusy = isAdding || isRemoving;

  const subtopicIds = React.useMemo(() => new Set(subtopics.map(subtopic => subtopic.id)), [subtopics]);
  const filteredResults = React.useMemo(
    () => results.filter(result => !subtopicIds.has(result.id)),
    [results, subtopicIds]
  );

  const invalidateSubtopics = async () => {
    await queryClient.invalidateQueries({ queryKey: ['subtopics', spaceId] });
  };

  const addSubtopic = (resultId: string) => {
    setSubspace(
      {
        subspaceId: spaceId,
        relationType: 'subtopic',
        topicEntityId: resultId,
      },
      {
        onSuccess: async () => {
          await invalidateSubtopics();
          onQueryChange('');
        },
      }
    );
  };

  const removeSubtopic = (topicId: string) => {
    setRemovingTopicId(topicId);

    unsetSubspace(
      {
        subspaceId: spaceId,
        relationType: 'subtopic',
        topicEntityId: topicId,
      },
      {
        onSuccess: async () => {
          invalidateSubtopics();
        },
        onSettled: () => {
          setRemovingTopicId(null);
        },
      }
    );
  };

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-100 flex items-start justify-center focus:outline-hidden">
          <div className="mt-32 flex w-[460px] flex-col gap-4 overflow-hidden rounded-xl bg-white px-4 pt-4 shadow-lg">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <Title asChild>
                  <Text variant="smallTitle" as="h2">
                    Subtopics
                  </Text>
                </Title>
                <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
              </div>

              <div className="flex flex-col gap-2">
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
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg">
                      <ResizableContainer duration={0.15}>
                        <div className="max-h-[240px] overflow-y-auto">
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
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  className="group relative flex w-full items-center px-3 py-2.5 text-left"
                                  onClick={() => addSubtopic(result.id)}
                                >
                                  <div className="absolute inset-1 z-0 rounded transition-colors duration-75 group-hover:bg-grey-01" />
                                  <div className="relative z-10 flex w-full flex-col gap-0.5">
                                    <span className="text-button text-text">{result.name}</span>
                                    {result.spaces.length > 0 && (
                                      <span className="text-tag text-grey-04">
                                        {result.spaces.length} {pluralize('space', result.spaces.length)}
                                      </span>
                                    )}
                                  </div>
                                </button>
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
                    <div className="flex items-center justify-between py-3">
                      <div className="flex flex-col gap-1.5">
                        <Text variant="button" as="p">
                          {subtopic.name}
                        </Text>
                      </div>
                      <button
                        type="button"
                        className="h-6 rounded-md border border-grey-02 px-[7px] text-metadata text-text"
                        disabled={isBusy}
                        onClick={() => removeSubtopic(subtopic.id)}
                      >
                        {isRemoving && removingTopicId === subtopic.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
