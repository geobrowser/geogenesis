import * as React from 'react';
import { Content, Overlay, Portal, Root, Trigger } from '@radix-ui/react-dialog';
import { Spacer } from '~/modules/design-system/spacer';
import { Button } from '~/modules/design-system/button';

interface Props {
  // open: boolean;
  // onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
}

export function EntityPageDeleteEntityModal({ trigger }: Props) {
  return (
    <Root>
      <Trigger asChild>{trigger}</Trigger>
      <Portal>
        <Overlay className="data-[state=open]:animate-overlayShow fixed inset-0 bg-text opacity-20" />
        <Content className="fixed top-[25%] left-[50%] max-h-[85vh] w-[90vw] max-w-[455px] translate-x-[-50%] translate-y-[-25%] rounded bg-white p-4 focus:outline-none">
          <h1 className="text-center text-metadataMedium">Delete entity</h1>
          <Spacer height={16} />
          <p>
            This will delete all attributes and values assigned to this entity. Deleting this entity may have unexpected
            side-effects as any entities referencing this entity will be broken.
          </p>
          <Spacer height={32} />
          <div className="flex items-center justify-between">
            <button className="text-button text-grey-04 transition-colors duration-75 hover:text-text">Cancel</button>
            <Button variant="secondary" icon="trash">
              Delete
            </Button>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
