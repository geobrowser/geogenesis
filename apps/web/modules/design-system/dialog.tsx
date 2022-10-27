import React from 'react';
import styled from '@emotion/styled';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Button, IconButton } from './button';
import { Text } from './text';
import { useTheme } from '@emotion/react';
import { Spacer } from './spacer';

interface ContentProps {
  children: React.ReactNode;
  width: number;
  alignOffset?: number;
  sideOffset?: number;
}

const StyledContent = styled(PopoverPrimitive.Content)<ContentProps>(props => ({
  borderRadius: props.theme.radius,
  padding: props.theme.space * 3,
  width: props.width,
  backgroundColor: props.theme.colors.white,
  boxShadow: props.theme.shadows.dropdown,

  border: `1px solid ${props.theme.colors['grey-02']}`,
}));

const ButtonGroup = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

interface Props {
  inputContainerWidth: number;
}

export function FilterDialog({ inputContainerWidth }: Props) {
  const theme = useTheme();

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <IconButton icon="filter" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <StyledContent
          width={inputContainerWidth}
          sideOffset={theme.space * 2.5 + 2}
          alignOffset={-(theme.space * 2.5)}
          align="end"
          onOpenAutoFocus={event => event.preventDefault()}
        >
          <Text variant="button">Show item(s) that:</Text>
          <Spacer height={12} />
          <ButtonGroup>
            <Button icon="create" variant="secondary">
              And
            </Button>
            <ButtonGroup>
              <Button icon="trash" variant="secondary">
                Clear all
              </Button>
              <Spacer width={12} />
              <Button icon="tick" variant="secondary" disabled>
                Apply all filters
              </Button>
            </ButtonGroup>
          </ButtonGroup>
        </StyledContent>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
