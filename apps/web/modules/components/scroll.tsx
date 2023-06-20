import * as React from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';

type ScrollProps = {
  children: React.ReactNode;
};

export const Scroll = ({ children }: ScrollProps) => {
  return (
    <ScrollArea.Root>
      <ScrollArea.Viewport className="relative h-full max-h-screen">{children}</ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className={SCROLLBAR_CLASSNAMES}>
        <ScrollArea.Thumb className={THUMB_CLASSNAMES} />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
};

const SCROLLBAR_CLASSNAMES = `bg-transparent flex touch-none select-none p-0.5 transition-colors data-[orientation=horizontal]:h-3 data-[orientation=vertical]:w-3 data-[orientation=horizontal]:flex-col`;

const THUMB_CLASSNAMES = `bg-grey-03 flex-1 rounded-full`;
