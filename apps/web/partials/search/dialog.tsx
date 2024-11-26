import { A } from '@mobily/ts-belt';
import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { useCallback, useState } from 'react';

import { useSearch } from '~/core/hooks/use-search';
import { NavUtils } from '~/core/utils/utils';

import { ResultContent, ResultsList, SpaceContent } from '~/design-system/autocomplete/results-list';
import { Dots } from '~/design-system/dots';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { Search } from '~/design-system/icons/search';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';

interface Props {
  open: boolean;
  onDone: () => void;
}

export const SearchDialog = ({ open, onDone }: Props) => {
  const router = useRouter();
  const autocomplete = useSearch();

  const [page, setPage] = useState<number | null>(null);
  const selectedEntity = page !== null ? autocomplete.results[page] : null;

  const handleOpenChange = useCallback(() => {
    autocomplete.onQueryChange('');
    setPage(null);
    onDone();
  }, [autocomplete, onDone]);

  if (!open) return null;

  return (
    <Command.Dialog open={open} onOpenChange={handleOpenChange} label="Entity search">
      <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center">
        <div className="pointer-events-auto mt-32 w-full max-w-[434px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-dropdown">
          <Command.List>
            {page === null && (
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
                    {autocomplete.isEmpty && (
                      <Command.Empty className="px-2 pb-2">No results found for {autocomplete.query}</Command.Empty>
                    )}
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
                                setPage(i);
                              } else {
                                router.push(NavUtils.toEntity(result.spaces[0].spaceId, result.id));
                                autocomplete.onQueryChange('');
                                setPage(null);
                                onDone();
                              }
                            }}
                          >
                            <ResultContent
                              // The onClick behavior is handled by cmdk.
                              onClick={() => {}}
                              result={result}
                              onChooseSpace={() => setPage(i)}
                            />
                          </Command.Item>
                        </div>
                      </motion.div>
                    ))}
                  </ResultsList>
                </ResizableContainer>
              </>
            )}
            {page !== null && selectedEntity && (
              <div>
                <button autoFocus className="sr-only" aria-hidden />
                <Command.Item
                  onSelect={() => setPage(null)}
                  className="flex w-full items-center border-b border-divider p-2 transition-colors duration-150 hover:bg-grey-01 focus:bg-grey-01"
                >
                  <div className="size-[12px] *:size-[12px]">
                    <LeftArrowLong color="grey-04" />
                  </div>
                  <div className="ml-2 text-footnoteMedium text-grey-04">Back</div>
                </Command.Item>
                <div>
                  {selectedEntity.spaces.map((space, i) => {
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
                              setPage(null);
                              onDone();
                            }}
                          >
                            <SpaceContent
                              // The onClick behavior is handled by cmdk.
                              onClick={() => {}}
                              result={selectedEntity}
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
