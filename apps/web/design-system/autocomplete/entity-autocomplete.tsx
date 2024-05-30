'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import pluralize from 'pluralize';

import * as React from 'react';
import { useState } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useConfiguredAttributeRelationTypes } from '~/core/hooks/use-configured-attribute-relation-types';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';

import { SquareButton } from '~/design-system/button';
import { Divider } from '~/design-system/divider';
import { Dots } from '~/design-system/dots';
import { Search } from '~/design-system/icons/search';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { TextButton } from '~/design-system/text-button';

import { CreateSmall } from '../icons/create-small';
import { EntityCreatedToast } from './entity-created-toast';
import { ResultContent, ResultsList } from './results-list';

interface ContentProps {
  children: React.ReactNode;
  alignOffset?: number;
  sideOffset?: number;
}

const StyledContent = (props: ContentProps) => {
  return (
    <PopoverPrimitive.Content
      className="z-[1] flex h-full w-[384px] flex-col overflow-hidden rounded bg-white shadow-inner-grey-02 md:mx-auto md:w-[98vw]"
      align="start"
      avoidCollisions={false}
      // We force  so we can control exit animations through framer-motion
      forceMount={true}
      {...props}
    />
  );
};

const MotionContent = motion(StyledContent);

interface Props {
  entityValueIds: string[];
  onDone: (result: { id: string; name: string | null }) => void;
  allowedTypes?: { typeId: string; typeName: string | null }[];
  spaceId: string;
  attributeId?: string;
}

export function EntityAutocompleteDialog({ onDone, entityValueIds, allowedTypes, spaceId, attributeId }: Props) {
  const [, setToast] = useToast();
  const { upsert } = useActionsStore();
  const autocomplete = useAutocomplete({
    allowedTypes: allowedTypes?.map(type => type.typeId),
  });
  const entityItemIdsSet = new Set(entityValueIds);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { spaces } = useSpaces();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  const attributeRelationTypes = useConfiguredAttributeRelationTypes({ entityId: attributeId ?? '' });
  const relationValueTypesForAttribute = attributeId ? attributeRelationTypes[attributeId] ?? [] : [];

  React.useEffect(() => {
    const handleQueryChange = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        autocomplete.onQueryChange('');
      }
    };

    document.addEventListener('click', handleQueryChange);
    return () => document.removeEventListener('click', handleQueryChange);
  }, [autocomplete]);

  const onCreateNewEntity = () => {
    const newEntityId = ID.createEntityId();

    // Create new entity with name and types
    upsert(
      {
        type: 'SET_TRIPLE',
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.NAME,
        entityName: autocomplete.query,
        attributeName: 'Name',
        value: {
          type: 'TEXT',
          value: autocomplete.query,
        },
      },
      spaceId
    );

    if (allowedTypes) {
      allowedTypes.forEach(type => {
        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.TYPES,
            entityName: autocomplete.query,
            attributeName: 'Types',
            value: {
              type: 'ENTITY',
              value: type.typeId,
              name: type.typeName,
            },
          },
          spaceId
        );
      });
    }

    if (relationValueTypesForAttribute) {
      relationValueTypesForAttribute.forEach(type => {
        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.TYPES,
            entityName: autocomplete.query,
            attributeName: 'Types',
            value: {
              type: 'ENTITY',
              value: type.typeId,
              name: type.typeName,
            },
          },
          spaceId
        );
      });
    }

    onDone({ id: newEntityId, name: autocomplete.query });
    setToast(<EntityCreatedToast entityId={newEntityId} spaceId={spaceId} />);
  };

  // @TODO: implement keyboard navigation

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <SquareButton icon={<CreateSmall />} />
      </PopoverPrimitive.Trigger>
      <AnimatePresence mode="wait">
        {open ? (
          <MotionContent
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            sideOffset={8}
          >
            <div className="relative p-2">
              <AnimatePresence initial={false} mode="wait">
                {autocomplete.isLoading ? (
                  <div className="absolute left-5 top-[50%] z-100">
                    <motion.span
                      key="dots"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Dots />
                    </motion.span>
                  </div>
                ) : (
                  <div className="absolute left-5 top-[1.125rem] z-100">
                    <motion.span
                      key="search"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                    >
                      <Search />
                    </motion.span>
                  </div>
                )}
              </AnimatePresence>
              <Input withExternalSearchIcon onChange={e => autocomplete.onQueryChange(e.currentTarget.value)} />
            </div>
            <ResizableContainer duration={0.125}>
              {!autocomplete.isEmpty && (
                <ResultsList>
                  {autocomplete.results.map((result, i) => (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.02 * i }}
                      key={result.id}
                    >
                      <ResultContent
                        key={result.id}
                        onClick={() => onDone(result)}
                        alreadySelected={entityItemIdsSet.has(result.id)}
                        result={result}
                        spaces={spaces}
                      />
                    </motion.div>
                  ))}
                </ResultsList>
              )}

              {!autocomplete.isLoading && autocomplete.query && (
                <div className="pb-2">
                  <Divider type="horizontal" />
                </div>
              )}

              {!autocomplete.isLoading && autocomplete.query && (
                <div className="flex items-center justify-between p-2 pt-0 text-smallButton">
                  <span>
                    {autocomplete.results.length} {pluralize('entity', autocomplete.results.length)} found
                  </span>
                  <div className="flex items-baseline gap-3">
                    {/* {!UserAgent.isMobile() && (
                      <p className="rounded-sm text-smallButton tabular-nums text-text">
                        {UserAgent.isMac() ? '⌘ + Enter' : 'Ctrl + Enter'}
                      </p>
                    )} */}
                    <TextButton onClick={onCreateNewEntity}>Create new entity</TextButton>
                  </div>
                </div>
              )}
            </ResizableContainer>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
