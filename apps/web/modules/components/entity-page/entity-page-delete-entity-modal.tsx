import * as React from 'react';
import { Content, Overlay, Portal, Root, Trigger } from '@radix-ui/react-dialog';
import { Spacer } from '~/modules/design-system/spacer';
import { Button } from '~/modules/design-system/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  onDelete: () => void;
}

export function EntityPageDeleteEntityModal({ trigger, open, onOpenChange, onDelete }: Props) {
  const onCancel = () => onOpenChange(false);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger asChild>{trigger}</Trigger>
      <Portal>
        <Overlay className="fixed inset-0 z-10 bg-text opacity-20" />
        <Content className="fixed top-[25%] left-[50%] z-100 max-h-[85vh] w-[90vw] max-w-[455px] translate-x-[-50%] translate-y-[-25%] rounded bg-white p-4 shadow-card focus:outline-none">
          <h1 className="text-center text-metadataMedium">Delete entity</h1>
          <Spacer height={16} />
          <p>
            This will delete all triples in this entity. Deleting this entity may have unexpected side-effects as any
            entities referencing this entity will be broken.
          </p>
          <Spacer height={32} />
          <div className="flex items-center justify-between">
            <button
              className="text-button text-grey-04 transition-colors duration-75 hover:text-text"
              onClick={onCancel}
            >
              Cancel
            </button>
            <Button variant="tertiary" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
