import styled from '@emotion/styled';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { ResizableContainer } from '~/modules/design-system/resizable-container';
import { Text } from '~/modules/design-system/text';
import { useAutocomplete } from '~/modules/search';
import { useSpaces } from '~/modules/spaces/use-spaces';
import { Entity } from '~/modules/types';
import { ResultContent, ResultsList } from './results-list';

const Container = styled.div({
  position: 'relative',
  width: '100%',
});

const QueryInput = styled.input(props => ({
  ...props.theme.typography.body,
  width: '100%',
  height: '100%',
  padding: 0,
  margin: 0,
  backgroundColor: 'transparent',

  '&::placeholder': {
    color: props.theme.colors['grey-02'],
  },

  '&:focus': {
    outline: 'none',
  },
}));

const ResultListContainer = styled.div(props => ({
  top: 36,
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: props.theme.radius,
  backgroundColor: props.theme.colors.white,
  zIndex: 1,
  width: 384,
  maxHeight: 340,
  overflow: 'hidden',
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
}));

const ResultListHeader = styled.p(props => ({
  padding: props.theme.space * 2.5,
}));

const AnimatedResultsItem = styled.div({});

interface Props {
  placeholder?: string;
  onDone: (result: Entity) => void;
  itemIds: string[];
  spaceId: string;
}

export function EntityTextAutocomplete({ placeholder, itemIds, onDone, spaceId }: Props) {
  const { query, results, onQueryChange } = useAutocomplete(spaceId);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemIdsSet = new Set(itemIds);
  const { spaces } = useSpaces();

  useEffect(() => {
    document.addEventListener('click', e => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onQueryChange('');
      }
    });
  }, [onQueryChange]);

  // TODO: Implement keyboard navigation

  return (
    <Container>
      <QueryInput placeholder={placeholder} value={query} onChange={e => onQueryChange(e.target.value)} />
      {query && (
        <ResultListContainer ref={containerRef}>
          <ResultListHeader>
            <Text variant="smallButton">Add a relation</Text>
          </ResultListHeader>
          <ResizableContainer duration={0.125}>
            <ResultsList>
              {results.map((result, i) => (
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
                      if (!itemIdsSet.has(result.id)) onDone(result);
                    }}
                    spaces={spaces}
                    alreadySelected={itemIdsSet.has(result.id)}
                    result={result}
                  />
                </motion.div>
              ))}
            </ResultsList>
          </ResizableContainer>
        </ResultListContainer>
      )}
    </Container>
  );
}
