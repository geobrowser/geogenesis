import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { SegmentedControl } from './debate-calendar-controls';

const OPTIONS = [
  { value: 'availability', label: 'Availability' },
  { value: 'debates', label: 'Debates' },
] as const;

function Harness() {
  const [value, setValue] = React.useState<'availability' | 'debates'>('availability');
  return <SegmentedControl label="Calendar view" options={OPTIONS} value={value} onChange={setValue} />;
}

afterEach(cleanup);

describe('SegmentedControl', () => {
  it('is one tab stop, on the checked option', () => {
    render(<Harness />);

    expect(screen.getByRole('radio', { name: 'Availability' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Debates' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves the choice and the focus with the arrow keys, wrapping at the ends', () => {
    render(<Harness />);
    const availability = screen.getByRole('radio', { name: 'Availability' });
    const debates = screen.getByRole('radio', { name: 'Debates' });

    availability.focus();
    fireEvent.keyDown(availability, { key: 'ArrowRight' });
    expect(debates).toHaveAttribute('aria-checked', 'true');
    expect(debates).toHaveFocus();

    fireEvent.keyDown(debates, { key: 'ArrowRight' });
    expect(availability).toHaveAttribute('aria-checked', 'true');
    expect(availability).toHaveFocus();

    fireEvent.keyDown(availability, { key: 'ArrowLeft' });
    expect(debates).toHaveAttribute('aria-checked', 'true');
  });
});
