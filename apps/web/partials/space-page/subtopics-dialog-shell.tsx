'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

export const SubtopicsDialogPopoverContext = React.createContext<HTMLDivElement | null>(null);

interface SubtopicsDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  showBack: boolean;
  onBack?: () => void;
  children: React.ReactNode;
}

export function SubtopicsDialogShell({
  open,
  onOpenChange,
  title,
  showBack,
  onBack,
  children,
}: SubtopicsDialogShellProps) {
  const [popoverContainer, setPopoverContainer] = React.useState<HTMLDivElement | null>(null);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-1000 flex items-start justify-center focus:outline-hidden">
          <div
            ref={setPopoverContainer}
            className="relative mt-32 flex max-h-[min(640px,80vh)] w-[460px] flex-col gap-4 overflow-visible rounded-xl bg-white px-4 pt-4 shadow-lg"
          >
            <div className="flex shrink-0 items-start justify-between">
              <div className="flex min-w-0 items-center gap-2">
                {showBack && onBack && (
                  <button
                    type="button"
                    aria-label="Back to subtopics"
                    onClick={onBack}
                    className="flex size-6 shrink-0 items-center justify-center text-grey-04 transition hover:text-text"
                  >
                    <ArrowLeft />
                  </button>
                )}
                <Title asChild>
                  <Text variant="smallTitle" as="h2" className="truncate">
                    {title}
                  </Text>
                </Title>
              </div>
              <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-visible overflow-y-auto pb-4">
              <SubtopicsDialogPopoverContext.Provider value={popoverContainer}>
                {children}
              </SubtopicsDialogPopoverContext.Provider>
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
