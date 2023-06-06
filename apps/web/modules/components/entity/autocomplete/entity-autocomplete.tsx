import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import * as React from 'react';
import { useState } from 'react';

import { SquareButton } from '~/modules/design-system/button';
import { Search } from '~/modules/design-system/icons/search';
import { Input } from '~/modules/design-system/input';
import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { Entity } from '~/modules/types';
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
  onDone: (result: Entity) => void;
  allowedTypes?: string[];
}

export function EntityAutocompleteDialog({ onDone, entityValueIds, allowedTypes }: Props) {
  const autocomplete = useAutocomplete({ allowedTypes });
  const entityItemIdsSet = new Set(entityValueIds);
  const { spaces } = useSpaces();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <SquareButton icon="createSmall" />
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
            <div className="relative m-0.5 p-2">
              <div className="absolute top-[1.125rem] left-5 z-100">
                <Search />
              </div>
              <Input withExternalSearchIcon onChange={e => autocomplete.onQueryChange(e.currentTarget.value)} />
            </div>
            <ResizableContainer duration={0.125}>
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
            </ResizableContainer>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
