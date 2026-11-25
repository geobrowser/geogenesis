import * as Popover from '@radix-ui/react-popover';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { PhonePanelSheet } from './phone-panel-sheet';
import { slideUpPopoverContainerAtom } from '~/atoms';

// A popover inside the panel that portals the way a claim's voters list does: it reads the container on
// the render that opens it (entity-vote-buttons.tsx RespondersPopover).
function PanelPopover() {
  const [open, setOpen] = React.useState(false);
  const portal = useElevatedPopoverPortal();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>Voters</Popover.Trigger>
      {portal ? (
        <Popover.Portal container={portal}>
          <Popover.Content data-testid="panel-popover">Five people</Popover.Content>
        </Popover.Portal>
      ) : null}
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
