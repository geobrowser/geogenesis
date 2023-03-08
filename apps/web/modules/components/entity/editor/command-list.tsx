import classNames from 'classnames';
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Text } from '~/modules/design-system/text';
import { CommandSuggestionItem } from './command-items';

export interface CommandListRef {
  onKeyDown: (o: { event: KeyboardEvent }) => boolean;
}
export interface CommandListProps {
  items: CommandSuggestionItem[];
  screen?: ReactNode;
  command: (...props: any) => void;
}
export const CommandList = forwardRef<CommandListRef, CommandListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item && props.command) {
      props.command(item);
    } else if (item) {
      item.command();
    }
  };
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => setSelectedIndex(0), [props.items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
        return true;
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex);
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
      <Text variant="smallButton" className="p-1">
        Select content block
      </Text>

      {props.items.length ? (
        props.items.map(({ title, icon }, index) => (
          <button
            className={classNames(
              `item ${index === selectedIndex ? 'is-selected bg-grey-02' : ''}`,
              'hover:bg-gray-200 flex flex items-center gap-2 rounded p-1'
            )}
            key={index}
            data-index={index}
            onMouseOver={() => setSelectedIndex(index)}
            onClick={() => selectItem(index)}
          >
            <div className="grid h-9 w-9 place-items-center rounded bg-divider">{icon}</div>
            <Text variant="metadataMedium">{title}</Text>
          </button>
        ))
      ) : (
        <div className="item">No actions</div>
      )}
    </div>
  );
});
CommandList.displayName = 'CommandList';
