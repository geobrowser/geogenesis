import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ElevatedPopoverPortalContext } from './elevated-popover-portal-context';
import { Select } from './select';

beforeAll(() => {
  // Radix Select needs these, which jsdom lacks.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

function Hosted({ host }: { host: boolean }) {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  const select = (
    <Select
      value="a"
      onChange={vi.fn()}
      options={[
        { value: 'a', label: 'Apple' },
        { value: 'b', label: 'Banana' },
      ]}
    />
  );
  return (
    <div data-testid="dialog" ref={setContainer}>
      {host ? (
        <ElevatedPopoverPortalContext.Provider value={container}>{select}</ElevatedPopoverPortalContext.Provider>
      ) : (
        select
      )}
    </div>
  );
}

function open() {
  const trigger = screen.getByRole('combobox');
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.getByRole('listbox');
}

describe('Select', () => {
  it('opens its options inside an enclosing dialog’s popover host, so they stack above it', () => {
    render(<Hosted host />);
    expect(screen.getByTestId('dialog')).toContainElement(open());
  });

  it('opens them on the body without a host', () => {
    render(<Hosted host={false} />);
    expect(screen.getByTestId('dialog')).not.toContainElement(open());
  });
});
