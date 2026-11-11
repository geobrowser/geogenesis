import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { lockedOutJoinAtom } from '~/core/state/locked-out-join';

import { AskEditorDialog } from './ask-editor-dialog';

const LINK = 'https://geo.test/space/abc?addBack=me';
const LOCKED_OUT = { link: LINK, spaceName: 'Debates' };

function renderDialog() {
  const store = createStore();
  render(
    <JotaiProvider store={store}>
      <AskEditorDialog />
    </JotaiProvider>
  );
  return store;
}

afterEach(cleanup);

describe('AskEditorDialog', () => {
  it('stays closed until a Join press finds the viewer locked out', () => {
    renderDialog();
    expect(screen.queryByText('Ask an editor to add you')).not.toBeInTheDocument();
  });

  // Visible rather than a tooltip, so it reads on phones, and the link is there to copy by hand.
  it('shows what to do and the link for an editor', () => {
    const store = renderDialog();
    act(() => store.set(lockedOutJoinAtom, LOCKED_OUT));

    // Named, because a queued join can open this after the viewer has moved on from the space.
    expect(
      screen.getByText(/on review only in Debates, so it can't accept a join request from you/)
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Link for an editor' })).toHaveValue(LINK);
  });

  it('clears the link when closed', async () => {
    const store = renderDialog();
    act(() => store.set(lockedOutJoinAtom, LOCKED_OUT));

    await userEvent.setup().click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(store.get(lockedOutJoinAtom)).toBeNull();
  });
});
