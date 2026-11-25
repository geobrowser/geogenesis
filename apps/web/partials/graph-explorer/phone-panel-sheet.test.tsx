import * as Popover from '@radix-ui/react-popover';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore, useStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { PhonePanelSheet } from './phone-panel-sheet';
import { slideUpPopoverContainerAtom } from '~/atoms';

// A popover inside the panel that portals the way a claim's voters list does once the React Compiler
// has memoized it (entity-vote-buttons.tsx RespondersPopover): it keeps the container it read on its
// first render, and falls back to the body.
function PanelPopover() {
  const store = useStore();
  const [container] = React.useState(() => store.get(slideUpPopoverContainerAtom));
  return (
    <Popover.Root>
      <Popover.Trigger>Voters</Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content data-testid="panel-popover">Five people</Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

describe('PhonePanelSheet', () => {
  afterEach(cleanup);

  // On the body they sat under the sheet's z-index and scroll lock, so a tap showed nothing (GEO-3849).
  it('keeps popovers opened from the panel inside the sheet, and gives the container back on close', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <PhonePanelSheet centreId="a" centreName="Alpha">
          <PanelPopover />
        </PhonePanelSheet>
      </Provider>
    );
    expect(store.get(slideUpPopoverContainerAtom)).toBeNull();

    fireEvent.click(screen.getByTestId('graph-panel-handle'));
    const sheet = screen.getByTestId('bottom-sheet');
    expect(sheet.contains(store.get(slideUpPopoverContainerAtom))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Voters' }));
    expect(sheet.contains(screen.getByTestId('panel-popover'))).toBe(true);

    fireEvent.keyDown(screen.getByTestId('panel-popover'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close alpha' }));
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
    expect(store.get(slideUpPopoverContainerAtom)).toBeNull();
  });
});
