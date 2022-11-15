import styled from '@emotion/styled';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';
import { Text } from './text';

const StyledTrigger = styled(SelectPrimitive.SelectTrigger)(props => ({
  all: 'unset',
  ...props.theme.typography.button,
  color: props.theme.colors.text,
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderRadius: props.theme.radius,
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  backgroundColor: props.theme.colors.white,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  boxShadow: `0px 1px 2px #F0F0F0`,
  textWrap: 'nowrap',
  whiteSpace: 'pre',

  '&:hover': {
    boxShadow: `inset 0 0 0 1px ${props.theme.colors.text}`,
    cursor: 'pointer',
  },

  '&:focus': {
    boxShadow: `inset 0 0 0 2px ${props.theme.colors.text}`,
    outline: 'none',
  },

  '&[data-placeholder]': { color: props.theme.colors.ctaPrimary },
}));

const StyledContent = styled(SelectPrimitive.Content)(props => ({
  overflow: 'hidden',
  backgroundColor: 'white',
  borderRadius: 6,
  border: `1px solid ${props.theme.colors['grey-02']}`,
}));

const StyledViewport = styled(SelectPrimitive.Viewport)(props => ({
  overflow: 'hidden',
  borderRadius: props.theme.radius,
}));

const StyledItem = styled(SelectPrimitive.Item)<{ disabled: boolean }>(props => ({
  all: 'unset',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  // width: 155,

  userSelect: 'none',
  borderBottom: `1px solid ${props.theme.colors['grey-02']}`,

  '&[data-highlighted]': {
    cursor: 'pointer',
    backgroundColor: props.theme.colors.divider,
    color: props.theme.colors.text,
  },

  ...(props.disabled && {
    color: props.theme.colors['grey-04'],
    cursor: 'not-allowed',
  }),
}));

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled: boolean }[];
}

export const Dropdown = ({ value, onChange, options }: Props) => (
  <SelectPrimitive.Root value={value} onValueChange={onChange}>
    <StyledTrigger>
      <SelectPrimitive.SelectValue />
      <Spacer width={8} />
      <ChevronDownSmall color="ctaPrimary" />
    </StyledTrigger>
    <SelectPrimitive.Portal>
      <StyledContent>
        <StyledViewport>
          {options.map(option => (
            <StyledItem key={option.value} value={option.value} disabled={option.disabled}>
              <SelectPrimitive.SelectItemText>
                <Text variant="button" color={option.disabled ? 'grey-04' : 'text'}>
                  {option.label}
                </Text>
              </SelectPrimitive.SelectItemText>
              {option.disabled && (
                <Text variant="footnote" color="grey-04">
                  You don’t have access yet
                </Text>
              )}
            </StyledItem>
          ))}
        </StyledViewport>
      </StyledContent>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
);
