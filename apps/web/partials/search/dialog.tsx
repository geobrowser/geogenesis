import { A } from '@mobily/ts-belt';
import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useSearch } from '~/core/hooks/use-search';
import { SearchResult } from '~/core/io/dto/search';
import { NavUtils } from '~/core/utils/utils';

import { ResultContent, ResultsList } from '~/design-system/autocomplete/results-list';
import { Dots } from '~/design-system/dots';
import { Search } from '~/design-system/icons/search';
import { Input } from '~/design-system/input';
import { ResizableContainer } from '~/design-system/resizable-container';

interface Props {
  onDone: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Dialog({ onDone, open, onOpenChange }: Props) {
  const autocomplete = useSearch();
  const router = useRouter();

  if (!open) return null;

  const separatedResults = autocomplete.results.reduce((acc, result) => {
    for (const space of result.spaces ?? []) {
      acc.push({
        ...result,
        spaces: [space],
      });
    }

    return acc;
  }, [] as SearchResult[]);

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Entity search">
      <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center">
        <div className="pointer-events-auto mt-32 w-full max-w-[434px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-dropdown">
          <div className={cx('relative p-2', A.isNotEmpty(autocomplete.results) && 'border-b border-grey-02')}>
            <AnimatePresence mode="wait">
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
              {separatedResults.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                >
                  {/* It's safe to cast nameTripleSpace since we only render entities that have a name triple */}
                  <Link href={NavUtils.toEntity(result.spaces![0].id, result.id)} onClick={() => onDone()}>
                    <Command.Item
                      className="transition-colors duration-75 aria-selected:bg-grey-01"
                      onSelect={() => {
                        router.push(NavUtils.toEntity(result.spaces![0].id, result.id));
                        onDone();
                      }}
                    >
                      <ResultContent
                        onClick={() => {
                          // The on-click is being handled by the ResultItem here. This is so we can
                          // have the keyboard navigation work as expected with the cmdk lib.
                        }}
                        result={result}
                      />
                    </Command.Item>
                  </Link>
                </motion.div>
              ))}
            </ResultsList>
          </ResizableContainer>
        </div>
      </div>
    </Command.Dialog>
  );
}
