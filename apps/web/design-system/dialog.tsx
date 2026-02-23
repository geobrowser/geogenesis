'use client';

import { Content, Overlay, Portal, Root, Title, Trigger } from '@radix-ui/react-dialog';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

interface Props {
  title?: string;
  trigger: React.ReactNode;
  header: React.ReactNode;
  content: React.ReactNode;
}

export function Dialog(props: Props) {
  const [open, onOpenChange] = React.useState(false);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger className="w-full">{props.trigger}</Trigger>

      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Title className="sr-only">{props.title ?? 'Dialog Title'}</Title>
        <Content className="fixed inset-0 z-101 flex items-start justify-center focus:outline-hidden">
          <div className="mt-40 inline-flex max-h-[415px] max-w-[586px] flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4">
            <div className="flex items-center justify-between">
              {props.header}
              <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
            </div>

            {props.content}
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
