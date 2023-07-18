import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import pluralize from 'pluralize';

import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { ResultContent, ResultsList } from './results-list';
import { TextButton } from '~/modules/design-system/text-button';
import { Divider } from '~/modules/design-system/divider';
import { Dots } from '~/modules/design-system/dots';
import { ID } from '~/modules/id';
import { batch } from '@legendapp/state';
import { Triple } from '~/modules/triple';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { EntityCreatedToast } from './entity-created-toast';
import { useActionsStore } from '~/modules/action';
import { useToast } from '~/modules/hooks/use-toast';

interface Props {
  placeholder?: string;
  onDone: (result: { id: string; name: string | null }) => void;
  itemIds: string[];
  allowedTypes?: { typeId: string; typeName: string | null }[];
  spaceId: string;
}

export function EntityTextAutocomplete({ placeholder, itemIds, onDone, allowedTypes, spaceId }: Props) {
  const [, setToast] = useToast();
  const { create } = useActionsStore();
  const { query, onQueryChange, isLoading, isEmpty, results } = useAutocomplete({
    allowedTypes: allowedTypes?.map(type => type.typeId),
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemIdsSet = new Set(itemIds);
  const { spaces } = useSpaces();

  useEffect(() => {
    const handleQueryChange = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onQueryChange('');
      }
    };

    document.addEventListener('click', handleQueryChange);
    return () => document.removeEventListener('click', handleQueryChange);
  }, [onQueryChange]);

  const onCreateNewEntity = () => {
    const newEntityId = ID.createEntityId();

    // Create new entity with name and types
    batch(() => {
      create(
        Triple.withId({
          entityId: newEntityId,
          attributeId: SYSTEM_IDS.NAME,
          entityName: query,
          attributeName: 'Name',
          space: spaceId,
          value: {
            type: 'string',
            id: ID.createValueId(),
            value: query,
          },
        })
      );

      if (allowedTypes) {
        allowedTypes.forEach(type => {
          create(
            Triple.withId({
              entityId: newEntityId,
              attributeId: SYSTEM_IDS.TYPES,
              entityName: query,
              attributeName: 'Types',
              space: spaceId,
              value: {
                type: 'entity',
                id: type.typeId,
                name: type.typeName,
              },
            })
          );
        });
      }
    });

    onDone({ id: newEntityId, name: query });
    setToast(<EntityCreatedToast entityId={newEntityId} spaceId={spaceId} />);
  };

  // @TODO: implement keyboard navigation

  return (
    <div className="relative w-full">
      <input
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="m-0 h-full w-full bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none"
      />
      {query && (
        <div
          ref={containerRef}
          className="absolute top-[36px] z-[1] flex max-h-[400px] w-[384px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02"
        >
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {results.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                >
                  <ResultContent
                    key={result.id}
                    onClick={() => onDone(result)}
                    spaces={spaces}
                    alreadySelected={itemIdsSet.has(result.id)}
                    result={result}
                  />
                </motion.div>
              ))}
            </ResultsList>

            {!isEmpty && !isLoading && (
              <div className="pb-2">
                <Divider type="horizontal" />
              </div>
            )}

            <div className="flex items-center justify-between p-2 pt-0 text-smallButton">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.span
                    key="dots"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    <Dots />
                  </motion.span>
                ) : (
                  <motion.span
                    key="entities found"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                  >
                    {results.length} {pluralize('entity', results.length)} found
                  </motion.span>
                )}
              </AnimatePresence>
              <div className="flex items-baseline gap-3">
                {/* {!UserAgent.isMobile() && (
                  <p className="rounded-sm text-smallButton tabular-nums text-text">
                    {UserAgent.isMac() ? '⌘ + Enter' : 'Ctrl + Enter'}
                  </p>
                )} */}
                <TextButton onClick={onCreateNewEntity}>Create new entity</TextButton>
              </div>
            </div>
          </ResizableContainer>
        </div>
      )}
    </div>
  );
}
