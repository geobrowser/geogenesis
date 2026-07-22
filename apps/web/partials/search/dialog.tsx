import * as Dialog from '@radix-ui/react-dialog';

import { useCallback, useEffect, useState } from 'react';
import * as React from 'react';

import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { useFetchNextPageOnScroll } from '~/core/hooks/use-fetch-next-page-on-scroll';
import { useKey } from '~/core/hooks/use-key';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSearch } from '~/core/hooks/use-search';
import { useSpace } from '~/core/hooks/use-space';
import { useSpacesWhereMember } from '~/core/hooks/use-spaces-where-member';
import { EntityId } from '~/core/io/substream-schema';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils, hasName, validateEntityId } from '~/core/utils/utils';

import { ResultContent, ResultsList, SpaceContent } from '~/design-system/autocomplete/results-list';
import { Dots } from '~/design-system/dots';
import { GeoImage } from '~/design-system/geo-image';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { Search } from '~/design-system/icons/search';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';
import { Toggle } from '~/design-system/toggle';

type Props = {
  open: boolean;
  onDone: () => void;
};

type View = 'selectEntity' | 'selectSpace' | 'createEntity';

// Defaults to true (canonical graph only) unless the user has turned it off; persisted across sessions.
const SEARCH_CANONICAL_ONLY_KEY = 'geo.search.canonicalOnly';

const readCanonicalOnly = (): boolean =>
  typeof window === 'undefined' || window.localStorage.getItem(SEARCH_CANONICAL_ONLY_KEY) !== 'false';

export const SearchDialog = ({ open, onDone }: Props) => {
  if (!open) return null;

  return <SearchDialogComponent open={open} onDone={onDone} />;
};

const SearchDialogComponent = ({ open, onDone }: Props) => {
  const router = useRouter();
  const [canonicalOnly, setCanonicalOnly] = useState<boolean>(readCanonicalOnly);
  const [isShowingAdvanced, setIsShowingAdvanced] = useState<boolean>(false);
  // Explicit `true` (not just omitted) when off — useSearch uses this to tell
  // "user asked for unrestricted search" apart from "caller has no opinion",
  // and drops the canonical-plus-scoped-spaces eligibility filter accordingly.
  const autocomplete = useSearch({ enabled: open, includeNonCanonical: canonicalOnly ? false : true });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = autocomplete;

  const toggleCanonicalOnly = useCallback(() => {
    setCanonicalOnly(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem(SEARCH_CANONICAL_ONLY_KEY, String(next));
      return next;
    });
  }, []);
  const { hydrate } = useSyncEngine();

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
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

  const hasResults = autocomplete.results.length > 0;
  const resultsScrollRef = React.useRef<HTMLUListElement | null>(null);
  const handleResultsScroll = useFetchNextPageOnScroll<HTMLUListElement>({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    scrollRef: resultsScrollRef,
  });

  useKey('Enter', () => {
    if (!hasResults) return;

    const result = autocomplete.results[selectedIndex];

    if (result) {
      router.push(NavUtils.toEntity(result.spaces[0].spaceId, result.id));
      autocomplete.onQueryChange('');
      setOpenSpacesIndex(null);
      onDone();
    }
  });

  useKey('ArrowUp', event => {
    if (!hasResults) return;

    event.preventDefault();
    setSelectedIndex(prev => (prev - 1 + autocomplete.results.length) % autocomplete.results.length);
  });

  useKey('ArrowDown', event => {
    if (!hasResults) return;

    event.preventDefault();
    setSelectedIndex(prev => (prev + 1) % autocomplete.results.length);
  });

  useEffect(() => {
    if (!hasResults) return;

    const element = document.querySelector(`#search-result-${selectedIndex}`);

    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [hasResults, selectedIndex]);

  return (
    <Command.Dialog open={open} onOpenChange={handleOpenChange} label="Entity search">
      <Dialog.Title className="sr-only">Entity search</Dialog.Title>
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
                <div className="relative border-b border-grey-02 p-1">
                  <AnimatePresence mode="wait">
                    {autocomplete.isLoading ? (
                      <div className="absolute top-[50%] left-4 z-100">
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
                      <div className="absolute top-3.5 left-4 z-100">
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
                <div className="w-full">
                  <button
                    type="button"
                    onClick={() => setIsShowingAdvanced(prev => !prev)}
                    aria-expanded={isShowingAdvanced}
                    className="flex w-full justify-end border-b border-grey-02 px-2 py-1"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span className="text-[0.6875rem] text-grey-04">Advanced</span>
                      <span className={cx('transition duration-300 ease-in-out', isShowingAdvanced && 'scale-y-[-1]')}>
                        <ChevronDownSmall color="grey-04" />
                      </span>
                    </div>
                  </button>
                  <ResizableContainer>
                    {isShowingAdvanced && (
                      <div className="border-b border-grey-02 px-4 py-2">
                        <button
                          type="button"
                          onClick={toggleCanonicalOnly}
                          aria-pressed={canonicalOnly}
                          title="Limit results to the canonical graph plus your spaces. Turn off to search all entities."
                          className="flex w-full items-center justify-between text-footnoteMedium text-grey-04 transition-colors hover:text-text"
                        >
                          <span className="whitespace-nowrap">Canonical only</span>
                          <Toggle checked={canonicalOnly} />
                        </button>
                      </div>
                    )}
                  </ResizableContainer>
                </div>
                <ResizableContainer duration={0.15}>
                  <ResultsList ref={resultsScrollRef} onScroll={handleResultsScroll}>
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
                            onMouseEnter={() => {
                              router.prefetch(NavUtils.toEntity(result.spaces[0].spaceId, result.id));
                              hydrate([result.id]);
                            }}
                            onSelect={() => {
                              router.push(NavUtils.toEntity(result.spaces[0].spaceId, result.id));
                              autocomplete.onQueryChange('');
                              setOpenSpacesIndex(null);
                              onDone();
                            }}
                          >
                            <ResultContent
                              id={`search-result-${i}`}
                              // The onClick behavior is handled by cmdk.
                              onClick={() => {}}
                              result={result}
                              active={i === selectedIndex}
                              onChooseSpace={() => setOpenSpacesIndex(i)}
                            />
                          </Command.Item>
                        </div>
                      </motion.div>
                    ))}
                    {autocomplete.isFetchingNextPage ? (
                      <div className="flex items-center justify-center py-2 text-smallButton">
                        <Dots />
                      </div>
                    ) : null}
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
  const { personalSpaceId } = usePersonalSpaceId();
  const { space: personalSpace } = useSpace(personalSpaceId ?? undefined);
  const memberSpaces = useSpacesWhereMember(personalSpaceId ?? undefined);

  const [query, setQuery] = useState<string>('');

  const allSpaces = React.useMemo(() => {
    const spaces = [...memberSpaces];
    if (personalSpace && !spaces.some(s => s.id === personalSpace.id)) {
      spaces.unshift(personalSpace);
    }
    return spaces;
  }, [personalSpace, memberSpaces]);

  const namedSpaces = allSpaces.filter(space => hasName(space?.entity?.name));

  const renderedSpaces =
    query.length === 0
      ? namedSpaces
      : namedSpaces.filter(space => space?.entity?.name?.toLowerCase()?.startsWith(query.toLowerCase()));

  return (
    <div>
      <div className="border-grey flex items-center justify-between border-b border-grey-02">
        <div className="flex-1 p-2">
          <button onClick={() => setIsCreatingNewEntity(false)}>
            <ArrowLeft />
          </button>
        </div>
        <div className="flex-4 p-2 text-center text-button text-text">Select space to create entity in</div>
        <div className="flex-1"></div>
      </div>
      <div className="p-1">
        <Input value={query} onChange={event => setQuery(event.target.value)} withSearchIcon />
      </div>
      <div className="max-h-[190px] space-y-1 overflow-auto p-1">
        {renderedSpaces.map(space => (
          <CreateNewEntitySpaceItem key={space.id} space={space} entityId={entityId} onDone={onDone} />
        ))}
      </div>
    </div>
  );
};

type CreateNewEntitySpaceItemProps = {
  space: ReturnType<typeof useSpacesWhereMember>[number];
  entityId: EntityId;
  onDone?: () => void;
};

const CreateNewEntitySpaceItem = ({ space, entityId, onDone }: CreateNewEntitySpaceItemProps) => {
  const router = useRouter();

  return (
    <Command.Item
      onSelect={() => {
        router.push(NavUtils.toEntity(space.id, entityId, true));
        onDone?.();
      }}
      className="flex cursor-pointer items-center gap-2 rounded p-1 transition-colors duration-150 ease-in-out hover:bg-grey-01"
    >
      <div className="relative size-4 rounded bg-grey-01">
        <GeoImage value={space.entity.image} fill style={{ objectFit: 'cover' }} alt="" />
      </div>
      <div className="text-button text-text">{space.entity.name}</div>
    </Command.Item>
  );
};
