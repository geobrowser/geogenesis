import * as React from 'react';
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import cx from 'classnames';
import { Editor } from '@tiptap/react';

import { Text } from '~/modules/design-system/text';
import { SelectedEntityType, useEntityStore } from '~/modules/entity';
import { Triple } from '~/modules/types';
import { CommandSuggestionItem, tableCommandItem } from './command-items';
import { TableBlockTypePicker } from './blocks/table/table-block-type-picker';

export interface CommandListRef {
  onKeyDown: (o: { event: KeyboardEvent }) => boolean;
}

export interface CommandListProps {
  items: CommandSuggestionItem[];
  initialTypes: Triple[];
  spaceId: string;
  screen?: ReactNode;
  editor: Editor;
  command: (...props: any) => void;
}

type CommandListMode = 'select-block' | 'select-table';

export const CommandList = forwardRef<CommandListRef, CommandListProps>(({ command, items }, ref) => {
  const entityStore = useEntityStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<CommandListMode>('select-block');

  const handleTableSelect = (selectedType: SelectedEntityType) => {
    command({ ...tableCommandItem, selectedType: selectedType, spaceId: entityStore.spaceId });
  };

  const invokeItem = (item: CommandSuggestionItem) => {
    const isTableMode = item.title === tableCommandItem.title && mode === 'select-block';

    if (isTableMode) {
      setMode('select-table');
    } else {
      command(item);
    }
  };

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
        if (commandItem) invokeItem(commandItem);
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
      {mode === 'select-block' ? (
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
                onClick={() => invokeItem(items[selectedIndex])}
              >
                <div className="grid h-9 w-9 place-items-center bg-divider">{icon}</div>
                <Text variant="metadataMedium">{title}</Text>
              </button>
            ))
          ) : (
            <div className="item">No actions</div>
          )}
        </>
      ) : (
        <TableBlockTypePicker handleSelect={handleTableSelect} />
      )}
    </div>
  );
});
CommandList.displayName = 'CommandList';
