import styled from '@emotion/styled';
import { useRect } from '@radix-ui/react-use-rect';
import { useRef } from 'react';
import { useEntityTable } from '~/modules/entity';
import { Input } from '../../design-system/input';
import { TypeDialog } from '../filter/type-dialog';

const SearchInputContainer = styled.div(props => ({
  position: 'relative',
  width: '100%',

  '@media (max-width: 640px)': {
    marginLeft: 0,
  },
}));

const InputContainer = styled.div(props => ({
  overflow: 'hidden',
  display: 'flex',
  width: '100%',
  position: 'relative',
  gap: props.theme.space * 4,

  '@media (max-width: 640px)': {
    flexDirection: 'column',
    gap: props.theme.space,
  },
}));

interface Props {
  spaceId: string;
}

export function EntityInput({ spaceId }: Props) {
  const entityTableStore = useEntityTable();
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const inputRect = useRect(inputContainerRef.current);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    entityTableStore.setQuery(event.target.value);
  };

  return (
    <InputContainer ref={inputContainerRef}>
      <TypeDialog
        inputContainerWidth={Math.min(inputRect?.width || 0, 678)}
        filterState={entityTableStore.filterState}
        setFilterState={entityTableStore.setFilterState}
        spaceId={spaceId}
      />

      <SearchInputContainer>
        <Input withSearchIcon placeholder="Search entities..." value={entityTableStore.query} onChange={onChange} />
      </SearchInputContainer>
    </InputContainer>
  );
}
