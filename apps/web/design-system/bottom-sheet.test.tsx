import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

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
