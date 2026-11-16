import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useEditorKeyboard } from './use-editor-keyboard';

afterEach(cleanup);

function Harness({
  popoverOpen = false,
  onEscape,
  onSpace,
}: {
  popoverOpen?: boolean;
  onEscape: () => boolean;
  onSpace?: () => void;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  useEditorKeyboard(root, { popoverOpen, onEscape, onSpace });
  return (
    <>
      <div ref={root}>
        <button type="button">Clip 1</button>
        <input aria-label="Search" defaultValue="" />
        <input aria-label="Start time" defaultValue="0:01.0" />
        <textarea aria-label="Note" />
        <div role="slider" tabIndex={0} aria-label="Start edge" aria-valuenow={1} />
        <div role="menu">
          <div role="menuitem" tabIndex={0}>
            All warnings
          </div>
        </div>
        <div contentEditable suppressContentEditableWarning data-testid="editable">
          x
        </div>
      </div>
      <button type="button">Outside</button>
    </>
  );
}

const setup = (props: Partial<React.ComponentProps<typeof Harness>> = {}) => {
  const onEscape = vi.fn(() => true);
  const onSpace = vi.fn();
  const view = render(<Harness onEscape={onEscape} onSpace={onSpace} {...props} />);
  return { ...view, onEscape, onSpace };
};

const press = (target: Element, key: string) => fireEvent.keyDown(target, { key, code: key === ' ' ? 'Space' : key });

describe('useEditorKeyboard (GEO-3773)', () => {
  it('plays on Space from the page or after a click left focus on a button in the editor, and takes the press', () => {
    const { onSpace, getByText } = setup();
    expect(press(document.body, ' ')).toBe(false);
    expect(press(getByText('Clip 1'), ' ')).toBe(false);
    expect(onSpace).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a text field', 'Search'],
    ['a typed time', 'Start time'],
    ['a textarea', 'Note'],
    ['an edge handle', 'Start edge'],
  ])('leaves Space to %s', (_, label) => {
    const { onSpace, getByLabelText } = setup();
    expect(press(getByLabelText(label), ' ')).toBe(true);
    expect(onSpace).not.toHaveBeenCalled();
  });

  it('leaves Space to a menu, a contenteditable and anything outside the editor', () => {
    const { onSpace, getByText, getByTestId } = setup();
    press(getByText('All warnings'), ' ');
    press(getByTestId('editable'), ' ');
    press(getByText('Outside'), ' ');
    expect(onSpace).not.toHaveBeenCalled();
  });

  it('leaves Space with a modifier, and Space a control already handled', () => {
    const { onSpace, getByText } = setup();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space', metaKey: true });
    const button = getByText('Clip 1');
    button.addEventListener('keydown', event => event.preventDefault(), { once: true });
    press(button, ' ');
    expect(onSpace).not.toHaveBeenCalled();
  });

  it('leaves Space to the browser with no player to drive', () => {
    const onEscape = vi.fn(() => true);
    render(<Harness onEscape={onEscape} />);
    expect(press(document.body, ' ')).toBe(true);
  });

  it('never closes two levels with one Esc: one a Radix popover already took is left alone', () => {
    const { onEscape, getByText } = setup();
    const item = getByText('All warnings');
    item.addEventListener('keydown', event => event.preventDefault(), { once: true });
    press(item, 'Escape');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('takes Esc only when it closed something', () => {
    const onEscape = vi.fn(() => false);
    render(<Harness onEscape={onEscape} />);
    expect(press(document.body, 'Escape')).toBe(true);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('leaves Esc to a field with text in it and to an edge handle, but not to an empty field', () => {
    const { onEscape, getByLabelText } = setup();
    press(getByLabelText('Start time'), 'Escape');
    press(getByLabelText('Start edge'), 'Escape');
    expect(onEscape).not.toHaveBeenCalled();
    expect(press(getByLabelText('Search'), 'Escape')).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('closes an open popover with Esc even from a field with text in it', () => {
    const { onEscape, getByLabelText } = setup({ popoverOpen: true });
    press(getByLabelText('Start time'), 'Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('ignores Esc pressed outside the editor', () => {
    const { onEscape, getByText } = setup();
    press(getByText('Outside'), 'Escape');
    expect(onEscape).not.toHaveBeenCalled();
  });
});
