import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
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

const StyledContent = styled(PopoverPrimitive.Content)<ContentProps>(props => ({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: props.theme.radius,
  backgroundColor: props.theme.colors.white,
  zIndex: 1,
  width: 384,
  overflow: 'hidden',
  height: '100%',

  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,

  '@media (max-width: 768px)': {
    margin: '0 auto',
    width: '98vw',
  },
}));

const MotionContent = motion(StyledContent);

const InputContainer = styled.div(props => ({
  position: 'relative',
  margin: `${props.theme.space * 2}px`,
}));

const SearchIconContainer = styled.div(props => ({
  position: 'absolute',
  left: props.theme.space * 3,
  top: props.theme.space * 2.5,
  zIndex: 100,
}));

const AddEntityButton = styled(SquareButton)({
  width: 23,
  height: 23,
});

const AutocompleteInput = styled(Input)(props => ({
  paddingLeft: props.theme.space * 9,
}));

interface Props {
  entityValueIds: string[];
  onDone: (result: Entity) => void;
  spaceId: string;
}

export function EntityAutocompleteDialog({ onDone, entityValueIds, spaceId }: Props) {
  const autocomplete = useAutocomplete(spaceId);
  const theme = useTheme();
  const entityItemIdsSet = new Set(entityValueIds);
  const { spaces } = useSpaces();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <AddEntityButton as="span" icon="createSmall" />
      </PopoverPrimitive.Trigger>
      <AnimatePresence mode="wait">
        {open ? (
          <MotionContent
            forceMount={true} // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            avoidCollisions={false}
            sideOffset={theme.space * 2}
            align="start"
          >
            <InputContainer>
              <SearchIconContainer>
                <Search />
              </SearchIconContainer>
              <AutocompleteInput onChange={e => autocomplete.onQueryChange(e.target.value)} />
            </InputContainer>
            <ResizableContainer duration={0.125}>
              <ResultsList>
                {autocomplete.results.map((result, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * i }}
                    key={result.id}
                    onSelect={() => onDone(result)}
                  >
                    <ResultContent
                      key={result.id}
                      onClick={() => {
                        if (!entityItemIdsSet.has(result.id)) onDone(result);
                      }}
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
