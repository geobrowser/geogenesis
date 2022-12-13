import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { SquareButton } from '~/modules/design-system/button';
import { Search } from '../../design-system/icons/search';
import { Input } from '../../design-system/input';
import { Text } from '../../design-system/text';
import { useAutocomplete } from './autocomplete';

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
  boxShadow: props.theme.shadows.dropdown,
  zIndex: 1,
  width: 384,
  minHeight: 200,
  overflow: 'hidden',
  height: '100%',

  border: `1px solid ${props.theme.colors['grey-02']}`,

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

const ResultsList = styled.ul({
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  margin: 0,
  padding: 0,

  maxHeight: 580,
  overflowY: 'auto',
});

const Result = styled.button(props => ({
  all: 'unset',
  padding: `${props.theme.space * 2}px`,

  '&:hover': {
    backgroundColor: props.theme.colors['grey-01'],
  },

  '&:focus': {
    outline: 'none',
    backgroundColor: props.theme.colors['grey-01'],
  },
}));

const AddEntityButton = styled(SquareButton)({
  width: 23,
  height: 23,
});

const AutocompleteInput = styled(Input)(props => ({
  paddingLeft: props.theme.space * 9,
}));

interface Props {
  autocomplete: ReturnType<typeof useAutocomplete>;
  onDone: (result: { id: string; name: string | null }) => void;
}

export function EntityAutocompleteDialog({ onDone, autocomplete }: Props) {
  const theme = useTheme();

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
            <ResultsList>
              {autocomplete.query.length > 0
                ? autocomplete.results.map(result => (
                    <Result key={result.id} onClick={() => onDone(result)}>
                      <Text as="li" variant="metadataMedium" ellipsize>
                        {result.name ?? result.id}
                      </Text>
                    </Result>
                  ))
                : null}
            </ResultsList>
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
