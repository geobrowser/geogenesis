import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebateShareDialog } from './lazy-share-dialog';

const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('./share-dialog', () => ({
  DebateShareDialog: () => {
    mocks.render();
    return <div role="dialog" aria-label="Share debate" />;
  },
}));

afterEach(() => {
  cleanup();
  mocks.render.mockClear();
});

it('does not mount share controls for a closed feed card, then opens them on demand', async () => {
  const props = {
    open: false,
    onOpenChange: vi.fn(),
    debate: { id: 'debate' } as Debate,
    spaceId: 'space',
    openerRef: React.createRef<HTMLButtonElement>(),
  };
  const view = render(<DebateShareDialog {...props} />);
  expect(mocks.render).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(<DebateShareDialog {...props} open />);
  expect(await screen.findByRole('dialog', { name: 'Share debate' })).toBeTruthy();
  mocks.render.mockClear();
  view.rerender(<DebateShareDialog {...props} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(mocks.render).not.toHaveBeenCalled();
});
