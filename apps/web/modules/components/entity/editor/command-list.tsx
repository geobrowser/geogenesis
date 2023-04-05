import { Editor } from '@tiptap/react';
import classNames from 'classnames';
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Text } from '~/modules/design-system/text';
import { SelectedEntityType, useEntityStore } from '~/modules/entity';
import { Triple } from '~/modules/types';
import { TypeDialog } from '../../filter/type-dialog';
import { CommandSuggestionItem, tableCommandItem } from './command-items';

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
      className="items shadow-xl relative flex w-80 flex-col overflow-y-auto rounded bg-white p-1 shadow-card"
    >
      {mode === 'select-block' ? (
        <>
          <Text variant="smallButton" className="p-1">
            Select content block
          </Text>

          {items.length ? (
            items.map(({ title, icon }, index) => (
              <button
                className={classNames(
                  `item ${index === selectedIndex ? 'is-selected bg-grey-02' : ''}`,
                  'hover:bg-gray-200 flex items-center gap-2 rounded p-1'
                )}
                key={index}
                data-index={index}
                onMouseOver={() => setSelectedIndex(index)}
                onClick={() => invokeItem(items[selectedIndex])}
              >
                <div className="grid h-9 w-9 place-items-center rounded bg-divider">{icon}</div>
                <Text variant="metadataMedium">{title}</Text>
              </button>
            ))
          ) : (
            <div className="item">No actions</div>
          )}
        </>
      ) : (
        <div>
          <TypeDialog spaceId={entityStore.spaceId} handleSelect={handleTableSelect} />
        </div>
      )}
    </div>
  );
});
CommandList.displayName = 'CommandList';
