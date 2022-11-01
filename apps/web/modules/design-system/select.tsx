import styled from '@emotion/styled';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';

const StyledTrigger = styled(SelectPrimitive.SelectTrigger)(props => ({
  all: 'unset',
  ...props.theme.typography.button,
  color: props.theme.colors.ctaPrimary,
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderRadius: props.theme.radius,
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  gap: 5,
  backgroundColor: 'white',
  border: `1px solid ${props.theme.colors['grey-02']}`,
  boxShadow: `0px 1px 2px #F0F0F0`,
  textWrap: 'nowrap',
  whiteSpace: 'pre',

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
  padding: props.theme.space,
  borderRadius: props.theme.radius,
}));

const StyledItem = styled(SelectPrimitive.Item)(props => ({
  ...props.theme.typography.button,
  all: 'unset',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  position: 'relative',
  userSelect: 'none',

  '&[data-highlighted]': {
    backgroundColor: props.theme.colors.ctaPrimary,
    color: props.theme.colors.white,
  },
}));

const StyledItemText = styled(SelectPrimitive.SelectItemText)(props => ({
  ...props.theme.typography.button,
  color: props.theme.colors.ctaHover,
}));

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export const Select = ({ value, onChange, options }: Props) => (
  <SelectPrimitive.Root value={value} onValueChange={onChange}>
    <StyledTrigger aria-label="Food">
      <SelectPrimitive.SelectValue />
      <Spacer width={8} />
      <ChevronDownSmall color="ctaPrimary" />
    </StyledTrigger>
    <SelectPrimitive.Portal>
      <StyledContent>
        <StyledViewport>
          <SelectPrimitive.Group>
            {options.map(option => (
              <StyledItem key={option.value} value={option.value}>
                <StyledItemText>{option.label}</StyledItemText>
              </StyledItem>
            ))}
          </SelectPrimitive.Group>
        </StyledViewport>
      </StyledContent>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
);
