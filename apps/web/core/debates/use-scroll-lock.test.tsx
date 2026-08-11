import { render } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { useScrollLock } from './use-scroll-lock';

function Locked() {
  useScrollLock();
  return null;
}

afterEach(() => {
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

describe('useScrollLock', () => {
  it('restores what it found when the last holder lets go', () => {
    const view = render(<Locked />);
    expect(document.body.style.overflow).toBe('hidden');

    view.unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  // The case that broke the page: accepting a request navigates, so the room's pre-screen locks
  // before the request popup unlocks. Saving/restoring per dialog left `hidden` behind for good.
  it('survives holders whose lifetimes overlap out of order', () => {
    const first = render(<Locked />);
    const second = render(<Locked />);

    first.unmount();
    expect(document.body.style.overflow).toBe('hidden');

    second.unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });
});
