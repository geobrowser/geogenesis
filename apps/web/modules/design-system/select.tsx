import isPropValid from '@emotion/is-prop-valid';
import styled from '@emotion/styled';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ButtonVariant } from './button';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';

const StyledTrigger = styled(SelectPrimitive.SelectTrigger)<{ variant: ButtonVariant }>(props => ({
  all: 'unset',
  ...props.theme.typography.button,
  color: props.variant === 'secondary' ? props.theme.colors.text : props.theme.colors.white,
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderRadius: props.theme.radius,
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  gap: 5,
  backgroundColor: props.variant === 'secondary' ? props.theme.colors.white : props.theme.colors.text,
  boxShadow: `inset 0 0 0 1px ${props.theme.colors['grey-02']}`,
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

  '&[data-placeholder]': { color: props.theme.colors.text },
}));

const StyledContent = styled(SelectPrimitive.Content)(props => ({
  overflow: 'hidden',
  backgroundColor: props.theme.colors.white,
  borderRadius: 6,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  zIndex: 2,
}));

const StyledViewport = styled(SelectPrimitive.Viewport)(props => ({
  overflow: 'hidden',
  borderRadius: props.theme.radius,
}));

const StyledItem = styled(SelectPrimitive.Item, { shouldForwardProp: prop => isPropValid(prop) })<{ isLast: boolean }>(
  props => ({
    all: 'unset',
    ...props.theme.typography.button,
    color: props.theme.colors['grey-04'],
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: `${props.theme.space * 2.5}px ${props.theme.space * 3}px`,

    userSelect: 'none',

    ...(!props.isLast && {
      borderBottom: `1px solid ${props.theme.colors['grey-02']}`,
    }),

    '&[data-highlighted]': {
      cursor: 'pointer',
      backgroundColor: props.theme.colors.bg,
      color: props.theme.colors.text,
    },
  })
);

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  variant?: 'primary' | 'secondary';
}

export const Select = ({ value, onChange, options, variant = 'secondary' }: Props) => (
  <SelectPrimitive.Root value={value} onValueChange={onChange}>
    <StyledTrigger variant={variant}>
      <SelectPrimitive.SelectValue />
      <Spacer width={8} />
      <ChevronDownSmall color={variant === 'secondary' ? 'ctaPrimary' : 'white'} />
    </StyledTrigger>
    <SelectPrimitive.Portal>
      <StyledContent>
        <StyledViewport>
          <SelectPrimitive.Group>
            {options.map((option, index) => (
              <StyledItem isLast={index === options.length - 1} key={option.value} value={option.value}>
                <SelectPrimitive.SelectItemText>{option.label}</SelectPrimitive.SelectItemText>
              </StyledItem>
            ))}
          </SelectPrimitive.Group>
        </StyledViewport>
      </StyledContent>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
);
