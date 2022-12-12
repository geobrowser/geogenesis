import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import { computed, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useMemo, useState } from 'react';
import { Search } from '../design-system/icons/search';
import { Input } from '../design-system/input';
import { Text } from '../design-system/text';
import { useServices } from '../services';
import { INetwork } from '../services/network';
import { makeOptionalComputed } from '../utils';

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

const AutocompleteInput = styled(Input)(props => ({
  paddingLeft: props.theme.space * 9,
}));

class EntityAutocomplete {
  query$ = observable('');
  results$: ObservableComputed<{ id: string; name: string | null }[]>;

  constructor({ api }: { api: INetwork }) {
    this.results$ = makeOptionalComputed(
      [],
      computed(async () => await api.fetchEntities(this.query$.get()))
    );
  }

  onQueryChange = (query: string) => {
    this.query$.set(query);
  };
}

function useAutocomplete() {
  const { network } = useServices();

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({ api: network });
  }, [network]);

  useEffect(() => {
    return () => {
      autocomplete.query$.set('');
    };
  }, [autocomplete]);

  const results = useSelector(autocomplete.results$);
  const query = useSelector(autocomplete.query$);

  return {
    results,
    query,
    onQueryChange: autocomplete.onQueryChange,
  };
}

interface Props {
  withSearch?: boolean;
  trigger: React.ReactNode;
  onDone: (result: { id: string; name: string | null }) => void;
}

export function EntityAutocompleteDialog({ withSearch, trigger, onDone }: Props) {
  const theme = useTheme();
  const { results, query, onQueryChange } = useAutocomplete();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <AnimatePresence mode="wait">
        {open ? (
          <MotionContent
            forceMount={true} // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, y: -10 }}
            exit={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            avoidCollisions={false}
            sideOffset={theme.space * 2}
            align="center"
          >
            {withSearch ? (
              <>
                <InputContainer>
                  <SearchIconContainer>
                    <Search />
                  </SearchIconContainer>
                  <AutocompleteInput onChange={e => onQueryChange(e.target.value)} />
                </InputContainer>
              </>
            ) : null}
            <ResultsList>
              {query.length > 0
                ? results.map(result => (
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
