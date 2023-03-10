import { Editor } from '@tiptap/react';
import classNames from 'classnames';
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Text } from '~/modules/design-system/text';
import { SelectedEntityType } from '~/modules/entity';
import { Triple } from '~/modules/types';
import { TypeDialog } from '../../filter/type-dialog';
import { CommandSuggestionItem } from './command-items';

export interface CommandListRef {
  onKeyDown: (o: { event: KeyboardEvent }) => boolean;
}
export interface CommandListProps {
  items: CommandSuggestionItem[];
  initialTypes: Triple[];
  spaceId: string;
  screen?: ReactNode;
  editor: Editor;
  command?: (...props: any) => void;
  variant: 'key-press' | 'button';
}

type CommandListMode = 'select-block' | 'select-table';

export const CommandList = forwardRef<CommandListRef, CommandListProps>(
  ({ command, editor, items, spaceId, variant = 'key-press' }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mode, setMode] = useState<CommandListMode>('select-block');

    const tableItem = items.find(item => item.title === 'Table') as CommandSuggestionItem;

    const handleTableSelect = (type: SelectedEntityType) => {
      if (variant === 'key-press' && command) {
        command(tableItem, { editor, typeId: type.id });
      } else {
        tableItem.command({ editor, typeId: type.id });
      }
    };

    const invokeItem = (item: CommandSuggestionItem) => {
      if (!item) {
        return;
      } else if (item.title === 'Table' && mode === 'select-block') {
        setMode('select-table');
      } else if (variant === 'key-press' && command) {
        command(item);
      } else {
        item.command({ editor });
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
          invokeItem(items[selectedIndex]);
          return true;
        }

        return false;
      },
    }));
    useEffect(() => {
      const $div = containerRef.current;
      if (!$div) {
        return;
      }
      const $ele = $div.querySelector(`[data-index="${selectedIndex}"]`) as HTMLButtonElement;
      if (!$ele) {
        return;
      }
      const top = $div.scrollTop;

      const min = $ele.offsetTop;
      if (min < top) {
        $div.scrollTop = min;
        return;
      }
      const max = min + $ele.clientHeight;
      const h = $div.clientHeight;
      if (max > top + h) {
        $div.scrollTop = max - h;
      }
    }, [selectedIndex]);

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
                    'hover:bg-gray-200 flex flex items-center gap-2 rounded p-1'
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
            <TypeDialog spaceId={spaceId} handleSelect={handleTableSelect} />
          </div>
        )}
      </div>
    );
  }
);
CommandList.displayName = 'CommandList';
