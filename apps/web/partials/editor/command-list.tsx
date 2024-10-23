'use client';

import { Editor } from '@tiptap/react';
import cx from 'classnames';

import * as React from 'react';
import { ReactNode, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { useEditorInstance } from '~/core/state/editor/editor-provider';

import { Text } from '~/design-system/text';

import { CommandSuggestionItem, tableCommandItem } from './command-items';

export interface CommandListRef {
  onKeyDown: (o: { event: KeyboardEvent }) => boolean;
}

export interface CommandListProps {
  items: CommandSuggestionItem[];
  screen?: ReactNode;
  editor: Editor;
  command: (...props: any) => void;
}

export const CommandList = forwardRef<CommandListRef, CommandListProps>(({ command, items }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { spaceId } = useEditorInstance();

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => setSelectedIndex(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }

      if (event.key === 'Enter') {
        const commandItem = items[selectedIndex];
        if (commandItem) command(commandItem);
        return true;
      }

      return false;
    },
  }));

  return (
    <div
      ref={containerRef}
      className="items shadow-xl relative flex w-80 flex-col overflow-y-auto rounded bg-white shadow-card"
    >
      <>
        <Text variant="smallButton" className="p-1">
          Select content block
        </Text>
        {items.length ? (
          items.map(({ title, icon }, index) => (
            <button
              className={cx(
                `item ${index === selectedIndex ? 'is-selected bg-grey-01' : ''}`,
                'flex w-full items-center gap-2 p-1 hover:bg-grey-01'
              )}
              key={index}
              data-index={index}
              onMouseOver={() => setSelectedIndex(index)}
              onClick={() => {
                if (title === tableCommandItem.title) {
                  command({ ...tableCommandItem, spaceId });
                } else {
                  command(items[selectedIndex]);
                }
              }}
            >
              <div className="grid h-9 w-9 place-items-center bg-divider">{icon}</div>
              <Text variant="metadataMedium">{title}</Text>
            </button>
          ))
        ) : (
          <div className="item">No actions</div>
        )}
      </>
    </div>
  );
});
CommandList.displayName = 'CommandList';
