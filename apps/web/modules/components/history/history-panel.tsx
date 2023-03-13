import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';
import { Icon } from '~/modules/design-system/icon';

interface Props {
  children: React.ReactNode;
}

export function HistoryPanel({ children }: Props) {
  return (
    <Root>
      <Trigger>
        <button>
          <Icon icon="history" color="grey-04" />
        </button>
      </Trigger>
      <PopoverContent className="w-[360px] overflow-hidden rounded border border-grey-02">{children}</PopoverContent>
    </Root>
  );
}
