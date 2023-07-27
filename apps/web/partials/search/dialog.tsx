import { A } from '@mobily/ts-belt';
import cx from 'classnames';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';

import { Input } from '~/design-system/input';
import { useAutocomplete } from '~/core/hooks/use-autocomplete';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Entity } from '~/core/types';
import { ResultContent, ResultsList } from '../../design-system/autocomplete/results-list';
import { ResizableContainer } from '../../design-system/resizable-container';
import { Dots } from '../../design-system/dots';
import { Search } from '../../design-system/icons/search';

interface Props {
  onDone: (result: Entity) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Dialog({ onDone, open, onOpenChange }: Props) {
  const autocomplete = useAutocomplete();
  const { spaces } = useSpaces();

  if (!open) return null;

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Entity search">
      <div className="pointer-events-none fixed inset-0 z-100 flex h-full w-full items-start justify-center">
        <div className="pointer-events-auto mt-32 w-full max-w-[434px] overflow-hidden rounded border border-grey-02 bg-white shadow-dropdown">
          <div className={cx('relative p-2', A.isNotEmpty(autocomplete.results) && 'border-b border-grey-02')}>
            <AnimatePresence mode="wait">
              {autocomplete.isLoading ? (
                <div className="absolute top-[50%] left-5 z-100">
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
                <div className="absolute top-[1.125rem] left-5 z-100">
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
              {autocomplete.isEmpty && <Command.Empty>No results found for {autocomplete.query}</Command.Empty>}
              {autocomplete.results.map((result, i) => (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  key={result.id}
                >
                  <Command.Item onSelect={() => onDone(result)} className="aria-selected:bg-grey-01">
                    <ResultContent
                      onClick={() => {
                        // The on-click is being handled by the ResultItem here. This is so we can
                        // have the keyboard navigation work as expected with the cmdk lib.
                      }}
                      result={result}
                      spaces={spaces}
                    />
                  </Command.Item>
                </motion.div>
              ))}
            </ResultsList>
          </ResizableContainer>
        </div>
      </div>
    </Command.Dialog>
  );
}
