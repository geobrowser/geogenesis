'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

interface SubtopicsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MOCK_SUBTOPICS = [
  { id: '1', name: 'NBA (Official)', associatedSpaces: 3 },
  { id: '2', name: 'Basketball teams', associatedSpaces: 3 },
  { id: '3', name: 'G-League', associatedSpaces: 3 },
];

export function SubtopicsDialog({ open, onOpenChange }: SubtopicsDialogProps) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 z-100 flex items-center justify-center focus:outline-hidden">
          <div className="flex w-[460px] flex-col gap-4 overflow-hidden rounded-xl bg-white px-4 pt-4 shadow-lg">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <Title asChild>
                  <Text variant="smallTitle" as="h2">
                    Subtopics
                  </Text>
                </Title>
                <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
              </div>

              <div className="flex flex-col gap-2">
                <Text variant="metadata" as="p">
                  Add a subtopic
                </Text>
                <Input withSearchIcon placeholder="Search..." />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Text variant="metadata" as="p">
                Current subtopics
              </Text>

              <div className="flex flex-col">
                {MOCK_SUBTOPICS.map(subtopic => (
                  <div key={subtopic.id}>
                    <div className="h-px w-full bg-divider" />
                    <div className="flex items-center justify-between py-3">
                      <div className="flex flex-col gap-1.5">
                        <Text variant="button" as="p">
                          {subtopic.name}
                        </Text>
                        <Text variant="tag" as="p" color="grey-04">
                          {subtopic.associatedSpaces} associated spaces
                        </Text>
                      </div>
                      <button className="h-6 rounded-md border border-grey-02 px-[7px] text-metadata text-text">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
