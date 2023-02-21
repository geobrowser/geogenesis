import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { useWindowSize } from '~/modules/hooks/use-window-size';
import { Eye } from '../../design-system/icons/eye';

interface ContentProps {
  children: React.ReactNode;
  width: number;
  alignOffset?: number;
  sideOffset?: number;
}

const StyledContent = styled(PopoverPrimitive.Content)<ContentProps>(props => ({
  borderRadius: props.theme.radius,
  padding: props.theme.space * 3,
  width: `calc(${props.width}px / 2)`,
  backgroundColor: props.theme.colors.white,
  boxShadow: props.theme.shadows.button,
  zIndex: 1,

  border: `1px solid ${props.theme.colors['grey-02']}`,

  '@media (max-width: 768px)': {
    margin: '0 auto',
    width: '98vw',
  },
}));

const MotionContent = motion(StyledContent);

const StyledIconButton = styled.button<{ open: boolean }>(props => ({
  all: 'unset',
  backgroundColor: props.open ? props.theme.colors['grey-01'] : props.theme.colors.white,
  color: props.theme.colors['grey-04'],
  padding: `${props.theme.space * 2}px ${props.theme.space * 3}px`,
  transition: 'colors 0.15s ease-in-out',
  borderRadius: `0 ${props.theme.radius}px ${props.theme.radius}px 0`,
  borderLeft: 'none',

  '&:hover': {
    cursor: 'pointer',
    backgroundColor: props.theme.colors['grey-01'],
    color: props.theme.colors.text,
  },

  '&:active': {
    color: props.theme.colors.text,
    outlineColor: props.theme.colors.ctaPrimary,
  },

  '&:focus': {
    color: props.theme.colors.text,
    outlineColor: props.theme.colors.ctaPrimary,
  },
}));

interface Props {
  containerWidth: number;
  children: React.ReactNode;
  className?: string;
}

export function DebugPopover({ children, containerWidth, className }: Props) {
  const theme = useTheme();
  const { width } = useWindowSize();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <StyledIconButton className={className} aria-label="advanced-filter-button" open={open}>
          <Eye />
        </StyledIconButton>
      </PopoverPrimitive.Trigger>
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
            avoidCollisions={true}
            width={containerWidth}
            sideOffset={theme.space * 2.5 + 2}
            alignOffset={-(theme.space * 2) + 4}
            align={width > 768 ? 'end' : 'start'}
          >
            {children}
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
