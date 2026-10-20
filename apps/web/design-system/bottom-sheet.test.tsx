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
});
