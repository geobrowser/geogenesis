import styled from '@emotion/styled';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';
import { Text } from './text';

const StyledTrigger = styled(DropdownPrimitive.Trigger)(props => ({
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
  width: 103,

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

const StyledContent = styled(DropdownPrimitive.Content)(props => ({
  overflow: 'hidden',
  backgroundColor: 'white',
  borderRadius: 6,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  width: 155,
}));

const MotionContent = motion(StyledContent);

const StyledGroup = styled(DropdownPrimitive.Group)(props => ({
  overflow: 'hidden',
  borderRadius: props.theme.radius,
}));

const StyledItem = styled(DropdownPrimitive.Item)<{ disabled: boolean; isLast: boolean }>(props => ({
  all: 'unset',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,

  userSelect: 'none',

  ...(!props.isLast && {
    borderBottom: `1px solid ${props.theme.colors['grey-02']}`,
  }),

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
  options: { label: string; disabled: boolean; onClick: () => void }[];
}

export const Dropdown = ({ value, options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <DropdownPrimitive.Root onOpenChange={setOpen}>
      <StyledTrigger>
        <Text variant="button">{value}</Text>
        <Spacer width={8} />
        <ChevronDownSmall color="ctaPrimary" />
      </StyledTrigger>
      {/* <DropdownPrimitive.Portal> */}
      <AnimatePresence>
        {open && (
          <MotionContent
            forceMount={true} // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, y: -10 }}
            exit={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            align="end"
            sideOffset={2}
          >
            <StyledGroup>
              {options.map((option, index) => (
                <StyledItem
                  key={option.label}
                  disabled={option.disabled}
                  isLast={index === options.length - 1}
                  onClick={option.onClick}
                >
                  <Text variant="button" color={option.disabled ? 'grey-04' : 'text'}>
                    {option.label}
                  </Text>
                  {option.disabled && (
                    <Text variant="footnote" color="grey-04">
                      You don’t have access yet
                    </Text>
                  )}
                </StyledItem>
              ))}
            </StyledGroup>
          </MotionContent>
        )}
      </AnimatePresence>
      {/* </DropdownPrimitive.Portal> */}
    </DropdownPrimitive.Root>
  );
};
