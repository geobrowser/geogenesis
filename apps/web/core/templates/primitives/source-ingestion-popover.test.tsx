import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IngestionLink } from '~/core/chat/ingestion-link';
import { assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';

import type { EntityListSectionModel } from '../models';
import { RelatedListSection } from './related-list-section';

const auth = vi.hoisted(() => ({ authenticated: false, promptSignIn: vi.fn() }));
const resolveSeed = vi.hoisted(() => vi.fn());

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ authenticated: auth.authenticated, ready: true }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => auth.promptSignIn,
}));
vi.mock('~/core/chat/resolve-url-ingestion-seed', () => ({
  resolveUrlIngestionSeed: resolveSeed,
}));

const link: IngestionLink = {
  targetEntityId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  targetEntityName: 'Gaza ceasefire',
  propertyId: 'dddddddddddddddddddddddddddddddd',
  propertyName: 'Sources',
  direction: 'target-to-source',
};

const sources: EntityListSectionModel = {
  id: 'sources',
  title: 'Sources',
  layout: 'cards',
  items: [],
  emptyText: 'No sources',
  ingestionLink: link,
};

function renderSection(section: EntityListSectionModel = sources) {
  const store = createStore();
  render(
    <Provider store={store}>
      <RelatedListSection section={section} />
    </Provider>
  );
  return store;
}

beforeEach(() => {
  auth.authenticated = false;
  auth.promptSignIn.mockReset();
  resolveSeed.mockReset();
});
afterEach(cleanup);

describe('Sources section +', () => {
  it('is shown signed out, and the press opens sign-in instead of the form', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    expect(auth.promptSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toBeNull();
    expect(resolveSeed).not.toHaveBeenCalled();
  });

  it('signed in, submits the pasted link to the ingestion with the page to link back to', async () => {
    auth.authenticated = true;
    const seed = { mode: 'ingestion', url: 'https://example.com/story', link };
    resolveSeed.mockResolvedValue(seed);
    const listed = 'cccccccccccccccccccccccccccccccc';
    const store = renderSection({
      ...sources,
      items: [{ id: listed, kind: 'source', kindLabel: 'Source', title: 'Reuters report' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    expect(auth.promptSignIn).not.toHaveBeenCalled();

    // The old free-text source form is gone: no title / publisher fields.
    expect(screen.queryByText('Source title')).toBeNull();

    const input = screen.getByPlaceholderText(/Paste news, podcast, tweet, blog URLs/);
    fireEvent.change(input, { target: { value: 'example.com/story' } });
    await act(async () => {
      fireEvent.submit(input.closest('form') as HTMLFormElement);
    });

    await waitFor(() => expect(resolveSeed).toHaveBeenCalledTimes(1));
    // The link carries the rows the section already shows, so an enrich of one isn't linked twice.
    expect(resolveSeed).toHaveBeenCalledWith('https://example.com/story', 'TemplateSourcesSection', {
      ...link,
      listedEntityIds: [listed],
    });
    expect(store.get(assistantSeedAtom)).toEqual(seed);
    expect(store.get(isChatOpenAtom)).toBe(true);
    // The popover closes once the assistant has the link.
    await waitFor(() => expect(screen.queryByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toBeNull());
  });

  it('keeps the free-text add popover on sections that are not Sources', () => {
    auth.authenticated = true;
    renderSection({ id: 'cases', title: 'Cases', items: [] });

    fireEvent.click(screen.getByRole('button', { name: 'Add to cases' }));
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toBeNull();
  });
});
