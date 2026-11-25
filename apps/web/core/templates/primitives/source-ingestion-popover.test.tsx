import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IngestionLink } from '~/core/chat/ingestion-link';
import { assistantSeedAtom, isChatOpenAtom } from '~/core/state/chat-store';
import { pendingActionsAtom } from '~/core/state/pending-actions';

import type { EntityListSectionModel } from '../models';
import { TEMPLATE_ACTIONS } from '../template-actions';
import { RelatedListSection } from './related-list-section';

const auth = vi.hoisted(() => ({ authenticated: false, promptSignIn: vi.fn() }));
const resolveSeed = vi.hoisted(() => vi.fn());
const membership = vi.hoisted(() => ({ ensure: vi.fn(), access: vi.fn(), tx: vi.fn() }));
const account = vi.hoisted(() => ({
  personalSpaceId: null as string | null,
  isRegistered: false,
  isLoading: false,
  isSetupPending: false,
  /** The account address the readiness store has published; null while it restores. */
  address: '0x1111111111111111111111111111111111111111' as string | null,
}));
const SPACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PERSONAL_SPACE_ID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const PERSONAL_WRITE = { spaceId: PERSONAL_SPACE_ID, personal: true };
const ADDRESS = '0x1111111111111111111111111111111111111111';

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ authenticated: auth.authenticated, ready: true }),
}));
vi.mock('~/core/wallet/account-readiness', () => ({
  useAccountReadiness: () => ({ state: account.address ? 'ready' : 'restoring', address: account.address }),
  publishedAccountAddress: () => account.address,
  publishedSigningAccount: () => null,
  waitForSigningAccount: vi.fn(),
  SignedOutBeforeWriteError: class extends Error {},
  SigningAccountFailedError: class extends Error {},
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => auth.promptSignIn,
}));
vi.mock('~/core/chat/resolve-url-ingestion-seed', () => ({
  resolveUrlIngestionSeed: resolveSeed,
}));
vi.mock('~/core/access/request-space-membership', () => ({
  ensureSpaceMembership: membership.ensure,
}));
vi.mock('~/core/access/space-access', () => ({
  getSpaceAccessById: membership.access,
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  personalSpaceIdQueryKey: (address: string | null | undefined) => ['personal-space-id', address?.toLowerCase()],
  usePersonalSpaceId: () => ({
    personalSpaceId: account.personalSpaceId,
    isRegistered: account.isRegistered,
    isLoading: account.isLoading,
  }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: account.isSetupPending, topicId: null }),
}));
vi.mock('~/core/hooks/use-smart-account-transaction', () => ({
  useSmartAccountTransaction: () => membership.tx,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: SPACE_ID, entityId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
  usePathname: () => `/space/${SPACE_ID}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
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
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <RelatedListSection section={section} />
      </Provider>
    </QueryClientProvider>
  );
  return Object.assign(store, { queryClient });
}

/** The viewer's access to the page's space, as `getSpaceAccessById` answers it. */
function canEditPageSpace(canEdit: boolean) {
  membership.access.mockReturnValue(Effect.succeed({ canEdit, isEditor: canEdit, isMember: canEdit }));
}

// These tests cover the ingestion flow itself, so they switch the shipped-off Sources "+" on.
const SHIPPED_ADD_SOURCE = TEMPLATE_ACTIONS.addSource;
afterEach(() => {
  TEMPLATE_ACTIONS.addSource = SHIPPED_ADD_SOURCE;
});

beforeEach(() => {
  TEMPLATE_ACTIONS.addSource = true;
  auth.authenticated = false;
  auth.promptSignIn.mockReset();
  resolveSeed.mockReset();
  membership.ensure.mockReset().mockResolvedValue(false);
  membership.access.mockReset();
  membership.tx.mockReset();
  canEditPageSpace(true);
  Object.assign(account, {
    personalSpaceId: PERSONAL_SPACE_ID,
    isRegistered: true,
    isLoading: false,
    isSetupPending: false,
    address: ADDRESS,
  });
});

async function submitLink(value = 'example.com/story') {
  fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
  const input = screen.getByPlaceholderText(/Paste news, podcast, tweet, blog URLs/);
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    fireEvent.submit(input.closest('form') as HTMLFormElement);
  });
}
afterEach(cleanup);

describe('Sources section + while switched off', () => {
  it('draws no Add source button with the shipped flag', () => {
    TEMPLATE_ACTIONS.addSource = false;
    render(<RelatedListSection section={{ id: 'sources', title: 'Sources', items: [] }} />);
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add source' })).toBeNull();
  });
});

describe('Sources section +', () => {
  it('is shown signed out, and the press opens sign-in instead of the form', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    expect(auth.promptSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toBeNull();
    expect(resolveSeed).not.toHaveBeenCalled();
    expect(membership.access).not.toHaveBeenCalled();
    expect(membership.ensure).not.toHaveBeenCalled();
  });

  it('on a phone, signed in, opens the link form in a bottom sheet without raising the keyboard', () => {
    auth.authenticated = true;
    canEditPageSpace(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)' || query === '(hover: none), (pointer: coarse)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );
    try {
      renderSection();
      fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

      expect(screen.getByRole('dialog', { name: 'Add source' })).toHaveAttribute('data-testid', 'bottom-sheet');
      const input = screen.getByPlaceholderText(/Paste news, podcast, tweet, blog URLs/);
      expect(input).not.toHaveFocus();
      expect(input).toHaveClass('md:text-[16px]');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('signed in, a non-member imports into their own personal space, with a join request in the background', async () => {
    auth.authenticated = true;
    canEditPageSpace(false);
    // The request needs an editor's YES; the import must not wait on it.
    membership.ensure.mockReturnValue(new Promise(() => {}));
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    const store = renderSection();

    await submitLink();

    await waitFor(() => expect(resolveSeed).toHaveBeenCalledTimes(1));
    expect(resolveSeed).toHaveBeenCalledWith(
      'https://example.com/story',
      'TemplateSourcesSection',
      expect.objectContaining({ targetEntityId: link.targetEntityId }),
      PERSONAL_WRITE
    );
    expect(membership.access).toHaveBeenCalledWith(SPACE_ID, PERSONAL_SPACE_ID);
    expect(membership.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: SPACE_ID, personalSpaceId: PERSONAL_SPACE_ID, tx: membership.tx })
    );
    expect(store.get(isChatOpenAtom)).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("in the side panel over another space, picks the page's own space, not the route's", async () => {
    auth.authenticated = true;
    const panelSpace = 'ffffffffffffffffffffffffffffffff';
    // Not a member of the panel page's space: the import goes personal and the request goes there.
    canEditPageSpace(false);
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    renderSection({ ...sources, ingestionLink: { ...link, targetSpaceId: panelSpace } });

    await submitLink();

    await waitFor(() => expect(resolveSeed).toHaveBeenCalledTimes(1));
    expect(membership.access).toHaveBeenCalledWith(panelSpace, PERSONAL_SPACE_ID);
    expect(membership.ensure).toHaveBeenCalledWith(expect.objectContaining({ spaceId: panelSpace }));
    expect(membership.ensure).not.toHaveBeenCalledWith(expect.objectContaining({ spaceId: SPACE_ID }));
    expect(resolveSeed.mock.calls[0]?.[3]).toEqual(PERSONAL_WRITE);
  });

  it("in the side panel, a member of the page's space imports into it whatever space the route is", async () => {
    auth.authenticated = true;
    const panelSpace = 'ffffffffffffffffffffffffffffffff';
    membership.access.mockImplementation((spaceId: string) =>
      Effect.succeed({ canEdit: spaceId === panelSpace, isEditor: false, isMember: spaceId === panelSpace })
    );
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    renderSection({ ...sources, ingestionLink: { ...link, targetSpaceId: panelSpace } });

    await submitLink();

    await waitFor(() => expect(resolveSeed).toHaveBeenCalledTimes(1));
    expect(resolveSeed.mock.calls[0]?.[3]).toEqual({ spaceId: panelSpace, personal: false });
  });

  it("signed in, a member imports into the page's space and sends no membership request", async () => {
    auth.authenticated = true;
    canEditPageSpace(true);
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    renderSection();

    await submitLink();

    await waitFor(() => expect(resolveSeed).toHaveBeenCalledTimes(1));
    expect(resolveSeed.mock.calls[0]?.[3]).toEqual({ spaceId: SPACE_ID, personal: false });
    expect(membership.ensure).not.toHaveBeenCalled();
    expect(membership.tx).not.toHaveBeenCalled();
  });

  it('a failed access read imports into the personal space, which is always writable', async () => {
    auth.authenticated = true;
    membership.access.mockReturnValue(Effect.fail(new Error('index down')));
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    renderSection();

    await submitLink();

    await waitFor(() => expect(resolveSeed).toHaveBeenCalledTimes(1));
    expect(resolveSeed.mock.calls[0]?.[3]).toEqual(PERSONAL_WRITE);
  });

  it('while the personal space is being created, the import is queued like a vote and runs once it exists', async () => {
    auth.authenticated = true;
    canEditPageSpace(false);
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isSetupPending: true });
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    const store = renderSection();

    await submitLink();

    // Nothing ingested yet: held in the queue, the form closed as if sent.
    expect(resolveSeed).not.toHaveBeenCalled();
    const queued = store.get(pendingActionsAtom);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ requires: 'personalSpace', intent: 'https://example.com/story' });
    await waitFor(() => expect(screen.queryByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toBeNull());

    // The space lands; the runner replays the press, which reads it fresh and imports there.
    store.queryClient.setQueryData(['personal-space-id', ADDRESS.toLowerCase()], {
      isRegistered: true,
      personalSpaceId: PERSONAL_SPACE_ID,
      personalEntityId: null,
    });
    await act(async () => {
      await queued[0]!.run();
    });

    expect(resolveSeed).toHaveBeenCalledWith(
      'https://example.com/story',
      'TemplateSourcesSection',
      expect.objectContaining({ targetEntityId: link.targetEntityId }),
      PERSONAL_WRITE
    );
    expect(store.get(isChatOpenAtom)).toBe(true);
  });

  it('pressed while the account is still restoring, the queued import runs once the account and space arrive', async () => {
    auth.authenticated = true;
    canEditPageSpace(false);
    // Signed in, but the readiness store has no address yet: the personal space reads as loading.
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isLoading: true, address: null });
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    const store = renderSection();

    await submitLink();
    const queued = store.get(pendingActionsAtom);
    expect(queued).toHaveLength(1);
    await waitFor(() => expect(screen.queryByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toBeNull());

    // The account restores and its space loads; the press's closure still holds the null address.
    account.address = ADDRESS;
    store.queryClient.setQueryData(['personal-space-id', ADDRESS.toLowerCase()], {
      isRegistered: true,
      personalSpaceId: PERSONAL_SPACE_ID,
      personalEntityId: null,
    });
    await act(async () => {
      await queued[0]!.run();
    });

    expect(resolveSeed).toHaveBeenCalledWith(
      'https://example.com/story',
      'TemplateSourcesSection',
      expect.objectContaining({ targetEntityId: link.targetEntityId }),
      PERSONAL_WRITE
    );
  });

  it("a member's import queued while restoring replays into the page's space, flagged as not a personal write", async () => {
    auth.authenticated = true;
    canEditPageSpace(true);
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isLoading: true, address: null });
    resolveSeed.mockResolvedValue({ mode: 'ingestion', url: 'https://example.com/story', link });
    const store = renderSection();

    await submitLink();
    const queued = store.get(pendingActionsAtom);
    expect(queued).toHaveLength(1);

    account.address = ADDRESS;
    store.queryClient.setQueryData(['personal-space-id', ADDRESS.toLowerCase()], {
      isRegistered: true,
      personalSpaceId: PERSONAL_SPACE_ID,
      personalEntityId: null,
    });
    await act(async () => {
      await queued[0]!.run();
    });

    // The flag travels with the seed, so the assistant doesn't re-derive it from wherever the viewer is now.
    expect(resolveSeed.mock.calls[0]?.[3]).toEqual({ spaceId: SPACE_ID, personal: false });
    expect(membership.ensure).not.toHaveBeenCalled();
  });

  it('a queued import whose press is cleared (a sign-out) while the link is classified hands over no seed', async () => {
    auth.authenticated = true;
    canEditPageSpace(false);
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isLoading: true, address: null });
    let classify: (seed: unknown) => void = () => {};
    resolveSeed.mockReturnValue(new Promise(resolve => (classify = resolve)));
    const store = renderSection();

    await submitLink();
    const queued = store.get(pendingActionsAtom);
    expect(queued).toHaveLength(1);

    account.address = ADDRESS;
    store.queryClient.setQueryData(['personal-space-id', ADDRESS.toLowerCase()], {
      isRegistered: true,
      personalSpaceId: PERSONAL_SPACE_ID,
      personalEntityId: null,
    });
    let replay: Promise<void> | void = undefined;
    await act(async () => {
      replay = queued[0]!.run();
    });
    await waitFor(() => expect(resolveSeed).toHaveBeenCalledTimes(1));

    // Signing out clears the queue (PendingActionsRunner) while classify-url is still out.
    act(() => store.set(pendingActionsAtom, []));
    await act(async () => {
      classify({ mode: 'ingestion', url: 'https://example.com/story', link });
      await replay;
    });

    expect(store.get(assistantSeedAtom)).toBeNull();
    expect(store.get(isChatOpenAtom)).toBe(false);
  });

  it('with no personal space and none on its way, asks them to finish setting up, as a vote does', async () => {
    auth.authenticated = true;
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isSetupPending: false, isLoading: false });
    const store = renderSection();

    await submitLink();

    expect(await screen.findByRole('alert')).toHaveTextContent('Finish setting up your account to add sources.');
    expect(resolveSeed).not.toHaveBeenCalled();
    expect(store.get(pendingActionsAtom)).toHaveLength(0);
    expect(screen.getByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toHaveValue('example.com/story');
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
    expect(resolveSeed).toHaveBeenCalledWith(
      'https://example.com/story',
      'TemplateSourcesSection',
      { ...link, listedEntityIds: [listed] },
      { spaceId: SPACE_ID, personal: false }
    );
    expect(store.get(assistantSeedAtom)).toEqual(seed);
    expect(store.get(isChatOpenAtom)).toBe(true);
    // The popover closes once the assistant has the link.
    await waitFor(() => expect(screen.queryByPlaceholderText(/Paste news, podcast, tweet, blog URLs/)).toBeNull());
  });

  it('has no add button on sections that are not Sources, which have nothing to publish', () => {
    auth.authenticated = true;
    renderSection({ id: 'cases', title: 'Cases', items: [] });

    expect(screen.queryByRole('button', { name: /^Add/ })).toBeNull();
  });
});
