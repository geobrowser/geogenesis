'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';

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
}

const MOCK_SUBTOPICS = [
  { id: '1', name: 'NBA (Official)', associatedSpaces: 3 },
  { id: '2', name: 'Basketball teams', associatedSpaces: 3 },
  { id: '3', name: 'G-League', associatedSpaces: 3 },
];

export function SubtopicsDialog({ open, onOpenChange }: SubtopicsDialogProps) {
  const { query, onQueryChange, results, isLoading, isEmpty } = useSearch();

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
                              {isEmpty && (
                                <div className="px-3 py-2 text-button text-grey-04">No results found</div>
                              )}
                              {!isLoading &&
                                results.map((result, i) => (
                                  <motion.div
                                    key={result.id}
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.02 * i }}
                                  >
                                    <button className="group relative flex w-full items-center px-3 py-2.5 text-left">
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

                <div className="flex flex-col gap-2">
                  <Text variant="metadata" as="p">
                    Current subtopics
                  </Text>

                  <div className="flex flex-col">
                    {MOCK_SUBTOPICS.map(subtopic => (
                      <div key={subtopic.id}>
                        <div className="h-px w-full bg-divider" />
                        <div className="flex items-center justify-between py-3">
                          <div className="flex flex-col gap-1.5">
                            <Text variant="button" as="p">
                              {subtopic.name}
                            </Text>
                            <Text variant="tag" as="p" color="grey-04">
                              {subtopic.associatedSpaces} associated spaces
                            </Text>
                          </div>
                          <button className="h-6 rounded-md border border-grey-02 px-[7px] text-metadata text-text">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
        </Content>
      </Portal>
    </Root>
  );
}
