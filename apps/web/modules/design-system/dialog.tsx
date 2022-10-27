import React from 'react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Button, SmallButton } from './button';
import { Text } from './text';

const StyledContent = styled(PopoverPrimitive.Content)<ContentProps>(props => ({
  borderRadius: props.theme.radius,
  padding: props.theme.space * 3,
  width: props.width,
  backgroundColor: props.theme.colors.white,
  boxShadow: 'hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px',
}));

interface ContentProps {
  children: React.ReactNode;
  width: number;
  sideOffset?: number;
}

function Content({ children, ...props }: ContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <StyledContent align="end" {...props}>
        {children}
      </StyledContent>
    </PopoverPrimitive.Portal>
  );
}

// Exports
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverContent = Content;

interface Props {
  inputContainerWidth: number;
}

export const FilterDialog = ({ inputContainerWidth }: Props) => (
  <Popover>
    <PopoverTrigger asChild>
      <SmallButton aria-label="Update dimensions" icon="publish"></SmallButton>
    </PopoverTrigger>
    <PopoverContent width={inputContainerWidth} sideOffset={5}>
      <Text variant="button">Show item(s) that:</Text>
      <Button icon="create" variant="secondary">
        And
      </Button>
    </PopoverContent>
  </Popover>
);
