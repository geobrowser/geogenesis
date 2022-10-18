import styled from '@emotion/styled';
import { useEffect, useId, useRef } from 'react';

const StyledCellInput = styled.textarea<{ isEntity?: boolean; ellipsize?: boolean }>(props => ({
  ...props.theme.typography.tableCell,
  display: 'flex',
  color: props.isEntity ? props.theme.colors.ctaPrimary : props.theme.colors.text,
  backgroundColor: 'transparent', // To allow the row to be styled on hover
  padding: props.theme.space * 2.5,
  width: '100%',
  margin: 0,

  overflow: 'hidden',
  resize: 'none' /*remove the resize handle on the bottom right*/,

  ':focus': {
    outline: `1px solid ${props.theme.colors.text}`,
  },

  '::placeholder': {
    color: props.theme.colors['grey-03'],
  },

  ...(props.ellipsize && {
    whiteSpace: 'pre',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  }),
}));

interface Props {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  disabled?: boolean;
  placeholder?: string;
  isEntity?: boolean;
  ellipsize?: boolean;
}

export function CellInput(props: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.onChange(e);

    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  };

  return <StyledCellInput {...props} ref={ref} rows={1} onChange={onChange} />;
}
