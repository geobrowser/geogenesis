import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';

interface Props {
  children: React.ReactNode;
}

export function Panel({ children }: Props) {
  return (
    <Root>
      <Trigger>
        <button>Panel button</button>
      </Trigger>
      <PopoverContent align="end" sideOffset={8} className="w-[360px] overflow-hidden rounded border border-grey-03">
        {children}
      </PopoverContent>
    </Root>
  );
}
