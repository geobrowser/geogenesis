'use client';

import { Editor } from '@tiptap/react';
import cx from 'classnames';

import * as React from 'react';
import { ReactNode, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { Text } from '~/design-system/text';

import { CommandSuggestionItem } from './command-items';

interface CommandListRef {
  onKeyDown: (o: { event: KeyboardEvent }) => boolean;
}

interface CommandListProps {
  items: CommandSuggestionItem[];
  screen?: ReactNode;
  editor: Editor;
  command: (...props: any) => void;
}

export const CommandList = forwardRef<CommandListRef, CommandListProps>(({ command, items }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

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
      className="items shadow-xl relative flex w-[250px] flex-col overflow-y-auto rounded-lg border border-grey-02 bg-white p-1 shadow-card"
    >
      <>
        {items.length ? (
          items.map(({ title, icon }, index) => (
            <button
              className={cx(
                `item ${index === selectedIndex ? 'is-selected bg-grey-01' : ''}`,
                'group flex w-full cursor-pointer items-center gap-2 rounded-md p-1 transition-colors duration-100 hover:bg-grey-01'
              )}
              key={index}
              data-index={index}
              onMouseOver={() => setSelectedIndex(index)}
              onClick={() => {
                command(items[selectedIndex]);
              }}
              onMouseDown={e => {
                e.preventDefault();
              }}
            >
              <div
                className={cx(
                  'grid h-9 w-9 place-items-center rounded-sm bg-divider transition-colors duration-100 group-hover:bg-grey-02',
                  {
                    'bg-grey-02': index === selectedIndex,
                  }
                )}
              >
                {icon}
              </div>
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
