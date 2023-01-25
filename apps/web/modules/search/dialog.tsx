import styled from '@emotion/styled';
import { Search } from '~/modules/design-system/icons/search';
import { Input } from '~/modules/design-system/input';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { Entity } from '~/modules/types';
import { ResultContent, ResultsList } from '../components/entity/autocomplete/results-list';
import { Command } from 'cmdk';
import { A } from '@mobily/ts-belt';
import { motion } from 'framer-motion';
import { ResizableContainer } from '../design-system/resizable-container';

const SearchIconContainer = styled.div(props => ({
  position: 'absolute',
  left: props.theme.space * 5,
  top: props.theme.space * 4.5,
  zIndex: 100,
}));

const AutocompleteInput = styled(Input)(props => ({
  paddingLeft: props.theme.space * 9,
}));

interface Props {
  onDone: (result: Entity) => void;
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SearchDialog = styled(Command.Dialog)(props => ({
  position: 'fixed',
  display: 'flex',
  flexDirection: 'column',
  top: '25%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: '100%',
  maxWidth: 434,
  backgroundColor: props.theme.colors.white,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
  border: `1px solid ${props.theme.colors['grey-02']}`,
  boxShadow: props.theme.shadows.dropdown,
}));

const ResultItem = styled(Command.Item)(props => ({
  "&[aria-selected='true']": {
    backgroundColor: props.theme.colors['grey-01'],
  },
}));

const InputContainer = styled.div<{ shouldShowBorder?: boolean }>(props => ({
  position: 'relative',
  padding: props.theme.space * 2,
  ...(props.shouldShowBorder && {
    borderBottom: `1px solid ${props.theme.colors['grey-02']}`,
  }),
}));

const AnimatedResultsItem = motion(ResultItem);

export function Dialog({ onDone, spaceId, open, onOpenChange }: Props) {
  const autocomplete = useAutocomplete(spaceId);
  const { spaces } = useSpaces();

  return (
    <SearchDialog open={open} onOpenChange={onOpenChange} label="Entity search">
      <InputContainer shouldShowBorder={A.isNotEmpty(autocomplete.results)}>
        <SearchIconContainer>
          <Search />
        </SearchIconContainer>
        <AutocompleteInput
          value={autocomplete.query}
          onChange={e => autocomplete.onQueryChange(e.currentTarget.value)}
          placeholder="Search for an entity..."
        />
      </InputContainer>
      <ResizableContainer duration={0.15}>
        <ResultsList>
          {autocomplete.isEmpty && <Command.Empty>No results found for {autocomplete.query}</Command.Empty>}
          {autocomplete.results.map((result, i) => (
            <AnimatedResultsItem
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * i }}
              key={result.id}
              onSelect={() => onDone(result)}
            >
              <ResultContent
                onClick={() => {
                  // The on-click is being handled by the ResultItem here. This is so we can
                  // have the keyboard navigation work as expected with the cmdk lib.
                }}
                result={result}
                spaces={spaces}
              />
            </AnimatedResultsItem>
          ))}
        </ResultsList>
      </ResizableContainer>
    </SearchDialog>
  );
}

{
  /* <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <AddEntityButton as="span" icon="search" />
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
            align="end"
          >
            <InputContainer>
              <SearchIconContainer>
                <Search />
              </SearchIconContainer>
              <AutocompleteInput onChange={e => autocomplete.onQueryChange(e.target.value)} />
            </InputContainer>
            <ResizableContainer duration={0.125}>
              <ResultsList>
                {autocomplete.query.length > 0
                  ? autocomplete.results.map(result => (
                      <ResultContent
                        key={result.id}
                        onClick={() => {
                          onDone(result);
                          setOpen(false);
                        }}
                        result={result}
                        spaces={spaces}
                      />
                    ))
                  : null}
              </ResultsList>
            </ResizableContainer>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root> */
}
