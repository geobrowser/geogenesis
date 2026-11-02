import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { canStartMobileSheetGesture } from '~/core/utils/mobile-sheet-drag';
import { Z_LAYERS, Z_LAYER_CLASS } from '~/core/z-layers';

import { BottomSheet } from './bottom-sheet';

afterEach(cleanup);

function Sheet() {
  const [open, setOpen] = React.useState(false);
  return (
    <BottomSheet open={open} onOpenChange={setOpen} title="Daniel" trigger={<button type="button">Open</button>}>
      <button type="button">Request a debate</button>
    </BottomSheet>
  );
}

describe('BottomSheet', () => {
  it('opens as a named dialog on its own layer, and closes on Escape', () => {
    render(<Sheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const sheet = screen.getByRole('dialog', { name: 'Daniel' });
    expect(sheet).toHaveClass(Z_LAYER_CLASS.bottomSheet);
    expect(screen.getByRole('button', { name: 'Request a debate' })).toBeInTheDocument();

    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sits above every other layer', () => {
    const { bottomSheet, bottomSheetBackdrop, ...rest } = Z_LAYERS;
    expect(bottomSheet).toBeGreaterThan(bottomSheetBackdrop);
    expect(bottomSheetBackdrop).toBeGreaterThan(Math.max(...Object.values(rest)));
  });

  // GEO-3463: the debates panel's Filters sheet opens inside the panel's own modal sheet.
  it('says it is modal, so a surface underneath can step aside for its Escape', () => {
    render(<Sheet />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('dialog', { name: 'Daniel' })).toHaveAttribute('aria-modal', 'true');
  });

  // Review, 27 Oct: portaled into the panel's sheet, a swipe on the Filters sheet or its backdrop
  // reached the panel's own touch listeners and dragged or dismissed the panel under it.
  it('leaves the sheet it opens inside alone when swiped', () => {
    const outer = document.createElement('div');
    outer.innerHTML = '<section data-mobile-sheet-surface><div data-testid="container"></div></section>';
    document.body.appendChild(outer);
    const container = outer.querySelector<HTMLElement>('[data-testid="container"]')!;
    render(
      <BottomSheet open onOpenChange={() => {}} title="Filters" container={container}>
        <p>Body</p>
      </BottomSheet>
    );

    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(canStartMobileSheetGesture(screen.getByText('Body'), outer)).toBe(false);
    expect(canStartMobileSheetGesture(sheet, outer)).toBe(false);
    expect(canStartMobileSheetGesture(sheet.previousElementSibling, outer)).toBe(false);
    outer.remove();
  });

  it('portals into the container it is given, to stay inside another sheet’s focus trap', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(
      <BottomSheet open onOpenChange={() => {}} title="Filters" container={container}>
        <p>Body</p>
      </BottomSheet>
    );

    expect(container).toContainElement(screen.getByRole('dialog', { name: 'Filters' }));
    container.remove();
  });

  // Inside the debates panel's transformed sheet, `fixed` is placed against that sheet, so a screen-
  // based cap could overflow it and clip the top. On its own, the sheet keeps the screen-based cap.
  it('caps its height to the sheet it is portaled into, and to the screen otherwise', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { unmount } = render(
      <BottomSheet open onOpenChange={() => {}} title="Filters" container={container}>
        <p>Body</p>
      </BottomSheet>
    );
    expect(screen.getByTestId('bottom-sheet')).toHaveClass('max-h-full');
    expect(screen.getByTestId('bottom-sheet')).not.toHaveClass('max-h-[85dvh]');
    unmount();
    container.remove();

    render(
      <BottomSheet open onOpenChange={() => {}} title="Filters">
        <p>Body</p>
      </BottomSheet>
    );
    expect(screen.getByTestId('bottom-sheet')).toHaveClass('max-h-[85dvh]');
  });

  it('can show its title as a heading, with Close or the action it is given beside it', () => {
    const { rerender } = render(
      <BottomSheet open onOpenChange={() => {}} title="Filters" showTitle>
        <p>Body</p>
      </BottomSheet>
    );
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close filters' })).toBeInTheDocument();

    rerender(
      <BottomSheet
        open
        onOpenChange={() => {}}
        title="Filters"
        showTitle
        headerAction={<button type="button">Clear all</button>}
      >
        <p>Body</p>
      </BottomSheet>
    );
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close filters' })).not.toBeInTheDocument();
  });
});
