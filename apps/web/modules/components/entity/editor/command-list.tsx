import classNames from 'classnames';
import { cloneElement, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CommandSuggestionItem } from './commands';

export interface CommandListRef {
  onKeyDown: (o: { event: KeyboardEvent }) => boolean;
}
export interface CommandListProps {
  items: CommandSuggestionItem[];
  command: (...props: any) => void;
}
export const CommandList = forwardRef<CommandListRef, CommandListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      props.command(item);
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
      className="items relative flex h-80 w-80 flex-col overflow-y-auto rounded border p-1 shadow-lg"
    >
      {props.items.length ? (
        props.items.map((item, index) => (
          <button
            type={'button'}
            className={classNames(
              `item ${index === selectedIndex ? 'is-selected bg-gray-200' : ''}`,
              'hover:bg-gray-200 flex gap-2 rounded p-1'
            )}
            key={index}
            data-index={index}
            onClick={() => selectItem(index)}
          >
            <div className={'border-gray-300 text-gray-400 h-12 w-12 shrink-0 rounded border p-2'}>
              {/* {!item.icon && <MdImage className={'h-full w-full'} />} */}
              {item.icon &&
                cloneElement(item.icon, { className: classNames('h-full w-full', item.icon.props.className) })}
            </div>
            <div className={'flex flex-col '}>
              <span className={'self-start'}>{item.title}</span>
              <small className={'text-gray-500 truncate'}>{item.description}</small>
            </div>
          </button>
        ))
      ) : (
        <div className="item">No actions</div>
      )}
    </div>
  );
});
CommandList.displayName = 'CommandList';
