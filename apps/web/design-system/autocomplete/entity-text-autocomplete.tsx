'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';
import { useRef } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useConfiguredAttributeRelationTypes } from '~/core/hooks/use-configured-attribute-relation-types';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { Triple } from '~/core/utils/triple';

import { Divider } from '~/design-system/divider';
import { Dots } from '~/design-system/dots';
import { ResizableContainer } from '~/design-system/resizable-container';
import { TextButton } from '~/design-system/text-button';

import { EntityCreatedToast } from './entity-created-toast';
import { ResultContent, ResultsList } from './results-list';

interface Props {
  placeholder?: string;
  onDone: (result: { id: string; name: string | null; nameTripleSpace?: string }) => void;
  itemIds: string[];
  allowedTypes?: { typeId: string; typeName: string | null }[];
  spaceId: string;
  attributeId?: string;
  className?: string;
}

export function EntityTextAutocomplete({
  placeholder,
  itemIds,
  onDone,
  allowedTypes,
  spaceId,
  attributeId,
  className = '',
}: Props) {
  const [, setToast] = useToast();
  const { create } = useActionsStore();
  const { query, onQueryChange, isLoading, isEmpty, results } = useAutocomplete({
    allowedTypes: allowedTypes?.map(type => type.typeId),
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemIdsSet = new Set(itemIds);
  const { spaces } = useSpaces();

  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ entityId: attributeId ?? '' });
  const relationValueTypesForAttribute = attributeId ? attributeRelationTypes[attributeId] ?? [] : [];

  const onCreateNewEntity = () => {
    const newEntityId = ID.createEntityId();

    // Create new entity with name and types
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

    if (relationValueTypesForAttribute) {
      relationValueTypesForAttribute.forEach(type => {
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
        className={cx(
          'relative z-10 m-0 h-full w-full bg-transparent p-0 text-body placeholder:text-grey-02 focus:outline-none',
          className
        )}
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
              <div>
                <Divider type="horizontal" />
              </div>
            )}

            <div className="flex items-center justify-between p-2 text-smallButton">
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
