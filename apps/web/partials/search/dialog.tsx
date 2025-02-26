import { A } from '@mobily/ts-belt';
import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import Fuse from 'fuse.js';
import { useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { useCallback, useState } from 'react';
import * as React from 'react';

import { useSearch } from '~/core/hooks/use-search';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { EntityId } from '~/core/io/schema';
import { getImagePath, validateEntityId } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';

import { ResultContent, ResultsList, SpaceContent } from '~/design-system/autocomplete/results-list';
import { Dots } from '~/design-system/dots';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { Search } from '~/design-system/icons/search';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';

import { shouldStartInEditModeAtom } from '~/atoms';

interface Props {
  open: boolean;
  onDone: () => void;
}

type View = 'selectEntity' | 'selectSpace' | 'createEntity';

export const SearchDialog = ({ open, onDone }: Props) => {
  const router = useRouter();
  const autocomplete = useSearch();

  const [openSpacesIndex, setOpenSpacesIndex] = useState<number | null>(null);
  const [isCreatingNewEntity, setIsCreatingNewEntity] = useState<boolean>(false);
  const selectedEntity = openSpacesIndex !== null ? autocomplete.results[openSpacesIndex] : null;

  const handleOpenChange = useCallback(() => {
    autocomplete.onQueryChange('');
    setOpenSpacesIndex(null);
    setIsCreatingNewEntity(false);
    onDone();
  }, [autocomplete, onDone]);

  const isValidEntityId = validateEntityId(autocomplete.query);

  let view: View = 'selectEntity';
  if (openSpacesIndex !== null && selectedEntity) {
    view = 'selectSpace';
  } else if (isValidEntityId && isCreatingNewEntity) {
    view = 'createEntity';
  }

  if (!open) return null;

  return (
    <Command.Dialog open={open} onOpenChange={handleOpenChange} label="Entity search">
      <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center">
        <div className="pointer-events-auto mt-32 w-full max-w-[434px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-dropdown">
          <Command.List>
            {view === 'createEntity' && (
              <CreateNewEntityInSpace
                entityId={autocomplete.query as EntityId}
                setIsCreatingNewEntity={setIsCreatingNewEntity}
                onDone={() => {
                  autocomplete.onQueryChange('');
                  setIsCreatingNewEntity(false);
                  onDone();
                }}
              />
            )}
            {view === 'selectEntity' && (
              <>
                <div className={cx('relative p-1', A.isNotEmpty(autocomplete.results) && 'border-b border-grey-02')}>
                  <AnimatePresence mode="wait">
                    {autocomplete.isLoading ? (
                      <div className="absolute left-4 top-[50%] z-100">
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
                      <div className="absolute left-4 top-[0.875rem] z-100">
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
                  <Input
                    withExternalSearchIcon
                    onChange={e => autocomplete.onQueryChange(e.currentTarget.value)}
                    value={autocomplete.query}
                  />
                </div>
                <ResizableContainer duration={0.15}>
                  <ResultsList>
                    {autocomplete.isEmpty ? (
                      isValidEntityId ? (
                        <div className="px-2 pb-1">
                          <EntityIdNotFound setIsCreatingNewEntity={setIsCreatingNewEntity} />
                        </div>
                      ) : (
                        <Command.Empty className="px-2 pb-2">No results found for {autocomplete.query}</Command.Empty>
                      )
                    ) : null}
                    {autocomplete.results.map((result, i) => (
                      <motion.div
                        key={result.id}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * i }}
                        className="border-b border-divider last:border-none"
                      >
                        <div>
                          <Command.Item
                            onSelect={() => {
                              if (result.spaces.length > 1) {
                                setOpenSpacesIndex(i);
                              } else {
                                router.push(NavUtils.toEntity(result.spaces[0].spaceId, result.id));
                                autocomplete.onQueryChange('');
                                setOpenSpacesIndex(null);
                                onDone();
                              }
                            }}
                          >
                            <ResultContent
                              // The onClick behavior is handled by cmdk.
                              onClick={() => {}}
                              result={result}
                              onChooseSpace={() => setOpenSpacesIndex(i)}
                            />
                          </Command.Item>
                        </div>
                      </motion.div>
                    ))}
                  </ResultsList>
                </ResizableContainer>
              </>
            )}
            {view === 'selectSpace' && (
              <div>
                {/*
                  retains the focus trap inside the dialog even when the input above isn't rendered
                  see https://github.com/pacocoursey/cmdk/issues/322#issuecomment-2444703817
               */}
                <button autoFocus className="sr-only" aria-hidden />
                <Command.Item
                  onSelect={() => setOpenSpacesIndex(null)}
                  className="flex w-full cursor-pointer items-center border-b border-divider p-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01"
                >
                  <div className="size-[12px] *:size-[12px]">
                    <LeftArrowLong color="grey-04" />
                  </div>
                  <div className="ml-2 text-footnoteMedium text-grey-04">Back</div>
                </Command.Item>
                <div>
                  {selectedEntity?.spaces.map((space, i) => {
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * i }}
                        key={space.spaceId}
                        className="border-b border-divider last:border-none"
                      >
                        <div>
                          <Command.Item
                            onSelect={() => {
                              router.push(NavUtils.toEntity(space.spaceId, selectedEntity.id));
                              autocomplete.onQueryChange('');
                              setOpenSpacesIndex(null);
                              onDone();
                            }}
                          >
                            <SpaceContent
                              // The onClick behavior is handled by cmdk.
                              onClick={() => {}}
                              entityId={selectedEntity.id}
                              space={space}
                            />
                          </Command.Item>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
};

type EntityIdNotFoundProps = {
  setIsCreatingNewEntity: React.Dispatch<React.SetStateAction<boolean>>;
};

const EntityIdNotFound = ({ setIsCreatingNewEntity }: EntityIdNotFoundProps) => {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>No entity exists with this ID</div>
      <div>
        <button onClick={() => setIsCreatingNewEntity(true)} className="text-ctaPrimary">
          Create entity
        </button>
      </div>
    </div>
  );
};

type CreateNewEntityInSpaceProps = {
  entityId: EntityId;
  setIsCreatingNewEntity: React.Dispatch<React.SetStateAction<boolean>>;
  onDone?: () => void;
};

const CreateNewEntityInSpace = ({ entityId, setIsCreatingNewEntity, onDone }: CreateNewEntityInSpaceProps) => {
  const router = useRouter();

  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const spaces = useSpacesWhereMember(address);

  const [query, setQuery] = useState<string>('');

  const fuseOptions = {
    keys: ['spaceConfig.name', 'spaceConfig.description'],
  };

  const fuse = new Fuse(spaces, fuseOptions);

  const renderedSpaces = query.length === 0 ? spaces : fuse.search(query).map(result => result.item);

  const setShouldStartInEditMode = useSetAtom(shouldStartInEditModeAtom);

  return (
    <div>
      <div className="border-grey flex items-center justify-between border-b border-grey-02">
        <div className="flex-1 p-2">
          <button onClick={() => setIsCreatingNewEntity(false)}>
            <ArrowLeft />
          </button>
        </div>
        <div className="flex-[4] p-2 text-center text-button text-text">Select space to create entity in</div>
        <div className="flex-1"></div>
      </div>
      <div className="p-1">
        <Input value={query} onChange={event => setQuery(event.target.value)} withSearchIcon />
      </div>
      <div className="max-h-[190px] space-y-1 overflow-auto p-1">
        {renderedSpaces.map(space => {
          return (
            <Command.Item
              key={space.id}
              onSelect={() => {
                // Ensure they arrive in edit mode
                setShouldStartInEditMode(true);
                router.push(NavUtils.toEntity(space.id, entityId));
                onDone?.();
              }}
              className="flex cursor-pointer items-center gap-2 rounded p-1 transition-colors duration-150 ease-in-out hover:bg-grey-01"
            >
              <div className="relative size-4 rounded bg-grey-01">
                <img
                  src={getImagePath(space.spaceConfig.image)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <div className="text-button text-text">{space.spaceConfig.name}</div>
            </Command.Item>
          );
        })}
      </div>
    </div>
  );
};
