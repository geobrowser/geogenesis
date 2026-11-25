import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingActionsAtom } from '~/core/state/pending-actions';

import type { TemplateAddResult } from '../models';
import { TEMPLATE_ONTOLOGY } from '../ontology';
import type { TemplateAddOwner } from './template-add-edits';
import { useTemplateAddPublish } from './use-template-add-publish';

const auth = vi.hoisted(() => ({ authenticated: true, resolving: false, promptSignIn: vi.fn() }));
const account = vi.hoisted(() => ({
  personalSpaceId: null as string | null,
  isRegistered: false,
  isLoading: false,
  isSetupPending: false,
  address: '0x1111111111111111111111111111111111111111' as string | null,
}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  ensure: vi.fn(),
  tx: vi.fn(),
  makeProposal: vi.fn(),
  dispatch: vi.fn(),
  store: { setValues: vi.fn(), setRelations: vi.fn(), setAsPublished: vi.fn() },
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ authenticated: auth.authenticated, ready: true }),
}));
vi.mock('~/core/wallet/account-readiness', () => ({
  useAccountReadiness: () => ({ state: 'ready', address: account.address }),
  publishedAccountAddress: () => account.address,
  publishedSigningAccount: () => null,
  waitForSigningAccount: vi.fn(),
  SignedOutBeforeWriteError: class extends Error {},
  SigningAccountFailedError: class extends Error {},
}));
vi.mock('~/core/hooks/use-auth-resolving', () => ({ useAuthResolving: () => auth.resolving }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => auth.promptSignIn }));
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
vi.mock('~/core/hooks/use-smart-account-transaction', () => ({ useSmartAccountTransaction: () => mocks.tx }));
vi.mock('~/core/access/space-access', () => ({ getSpaceAccessById: mocks.access }));
vi.mock('~/core/access/request-space-membership', () => ({ ensureSpaceMembership: mocks.ensure }));
vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: mocks.store }) }));
vi.mock('~/core/state/status-bar-store', () => ({ useStatusBar: () => ({ dispatch: mocks.dispatch }) }));

const PAGE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PAGE_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PERSONAL_SPACE = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ADDRESS = '0x1111111111111111111111111111111111111111';
const OWNER: TemplateAddOwner = { entityId: PAGE, entityName: 'Gaza ceasefire', ownerKind: 'topic' };
const CLAIM = { kind: 'claim' as const, draft: { title: 'Aid entered on Monday', kind: 'fact' as const } };

function role(isEditor: boolean, isMember = isEditor) {
  mocks.access.mockReturnValue(Effect.succeed({ isEditor, isMember, canEdit: isEditor || isMember }));
}

/** The publish settles the way `usePublish` reports it: success or failure. */
function publishes(ok: boolean) {
  mocks.makeProposal.mockImplementation(async (args: { onSuccess?: () => void; onError?: () => void }) =>
    ok ? args.onSuccess?.() : args.onError?.()
  );
}

function renderPublisher() {
  const store = createStore();
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useTemplateAddPublish({ owner: OWNER, pageSpaceId: PAGE_SPACE }), { wrapper });
  return { ...hook, store, queryClient, invalidate };
}

beforeEach(() => {
  auth.authenticated = true;
  auth.resolving = false;
  auth.promptSignIn.mockReset();
  Object.assign(account, {
    personalSpaceId: PERSONAL_SPACE,
    isRegistered: true,
    isLoading: false,
    isSetupPending: false,
    address: ADDRESS,
  });
  mocks.access.mockReset();
  mocks.ensure.mockReset().mockResolvedValue(false);
  mocks.makeProposal.mockReset();
  mocks.dispatch.mockReset();
  Object.values(mocks.store).forEach(fn => fn.mockReset());
  role(true);
  publishes(true);
});
afterEach(cleanup);

describe('useTemplateAddPublish', () => {
  it("an editor's claim is written and published into the page's space, and the page's lists refetch", async () => {
    const { result, invalidate } = renderPublisher();

    let outcome: TemplateAddResult | undefined;
    await act(async () => {
      outcome = await result.current.add(CLAIM);
    });

    expect(outcome).toMatchObject({ ok: true, spaceId: PAGE_SPACE });
    const [args] = mocks.makeProposal.mock.calls[0]!;
    expect(args).toMatchObject({ spaceId: PAGE_SPACE, name: 'Add claim: Aid entered on Monday' });
    // Published from the edits alone; the local store (and so Review edits) never holds them.
    expect(mocks.store.setValues).not.toHaveBeenCalled();
    expect(mocks.store.setRelations).not.toHaveBeenCalled();
    expect(
      args.relations.some((r: { type: { id: string } }) => r.type.id === TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID)
    ).toBe(true);
    expect(outcome?.ok && outcome.id).toBe(args.values[0].entity.id);
    expect(invalidate).toHaveBeenCalled();
    expect(auth.promptSignIn).not.toHaveBeenCalled();
  });

  it("a non-editor member's claim is published into their personal space", async () => {
    role(false, true);
    const { result } = renderPublisher();

    let outcome: TemplateAddResult | undefined;
    await act(async () => {
      outcome = await result.current.add(CLAIM);
    });

    expect(outcome).toMatchObject({ ok: true, spaceId: PERSONAL_SPACE });
    expect(mocks.makeProposal.mock.calls[0]![0]).toMatchObject({ spaceId: PERSONAL_SPACE });
    expect(
      mocks.makeProposal.mock.calls[0]![0].values.every((v: { spaceId: string }) => v.spaceId === PERSONAL_SPACE)
    ).toBe(true);
  });

  it('a failed publish writes nothing to the store, so nothing is left for Review edits', async () => {
    publishes(false);
    const { result } = renderPublisher();

    let outcome: TemplateAddResult | undefined;
    await act(async () => {
      outcome = await result.current.add({ kind: 'event', draft: { title: 'Ceasefire signed', when: '2026-11-18' } });
    });

    expect(outcome).toMatchObject({ ok: false });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(mocks.store.setValues).not.toHaveBeenCalled();
    expect(mocks.store.setRelations).not.toHaveBeenCalled();
  });

  it('nothing is written to the store, during the publish or after', async () => {
    let finish!: () => void;
    mocks.makeProposal.mockImplementation(
      (args: { onSuccess?: () => void }) =>
        new Promise<void>(resolve => (finish = () => (args.onSuccess?.(), resolve())))
    );
    const { result } = renderPublisher();

    let pending!: Promise<TemplateAddResult>;
    await act(async () => {
      pending = result.current.add(CLAIM);
    });
    await vi.waitFor(() => expect(mocks.makeProposal).toHaveBeenCalled());
    expect(mocks.store.setValues).not.toHaveBeenCalled();

    await act(async () => finish());
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(mocks.store.setValues).not.toHaveBeenCalled();
  });

  it('signed out, submitting asks for sign-in and queues the whole draft without publishing', async () => {
    auth.authenticated = false;
    Object.assign(account, { personalSpaceId: null, isRegistered: false, address: null });
    const { result, store } = renderPublisher();

    act(() => {
      void result.current.add(CLAIM);
    });

    expect(auth.promptSignIn).toHaveBeenCalledTimes(1);
    const queued = store.get(pendingActionsAtom);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ requires: 'personalSpace', survivesRedirect: true });
    expect(JSON.parse(queued[0]!.intent!)).toEqual(CLAIM);
    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(mocks.store.setValues).not.toHaveBeenCalled();
  });

  it('signed out, the queued draft publishes once, into the right space, after sign-in', async () => {
    role(false, false);
    auth.authenticated = false;
    Object.assign(account, { personalSpaceId: null, isRegistered: false, address: null });
    const { result, rerender, store, queryClient } = renderPublisher();

    let outcome: TemplateAddResult | undefined;
    act(() => {
      void result.current.add(CLAIM).then(r => (outcome = r));
    });
    const [queued] = store.get(pendingActionsAtom);

    // They sign up: the account and its personal space arrive, and the queue replays the draft.
    auth.authenticated = true;
    Object.assign(account, { personalSpaceId: PERSONAL_SPACE, isRegistered: true, address: ADDRESS });
    queryClient.setQueryData(['personal-space-id', ADDRESS.toLowerCase()], {
      isRegistered: true,
      personalSpaceId: PERSONAL_SPACE,
      personalEntityId: null,
    });
    rerender();
    await act(async () => {
      await queued!.run();
    });

    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(mocks.makeProposal.mock.calls[0]![0]).toMatchObject({
      spaceId: PERSONAL_SPACE,
      name: 'Add claim: Aid entered on Monday',
    });
    expect(outcome).toMatchObject({ ok: true, spaceId: PERSONAL_SPACE });
  });

  it('signed out, an editor of the page publishes the queued draft into the page space', async () => {
    auth.authenticated = false;
    const { result, rerender, store } = renderPublisher();
    let outcome: TemplateAddResult | undefined;
    act(() => {
      void result.current.add(CLAIM).then(r => (outcome = r));
    });
    const [queued] = store.get(pendingActionsAtom);

    auth.authenticated = true;
    rerender();
    await act(async () => {
      await queued!.run();
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: true, spaceId: PAGE_SPACE });
  });

  it('a dismissed sign-in withdraws the draft and puts it back in its form', async () => {
    auth.authenticated = false;
    const { result, store } = renderPublisher();
    const restore = vi.fn();

    let pending!: Promise<TemplateAddResult>;
    act(() => {
      result.current.holdAddDraft(restore);
      pending = result.current.add(CLAIM);
    });
    const onCancel = auth.promptSignIn.mock.calls[0]![1]?.onCancel as () => void;
    act(() => onCancel());

    await expect(pending).resolves.toMatchObject({ ok: false });
    expect(store.get(pendingActionsAtom)).toHaveLength(0);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('still resolving, the draft is queued with the prompt left to the runner', () => {
    auth.authenticated = false;
    auth.resolving = true;
    const { result, store } = renderPublisher();
    act(() => {
      void result.current.add(CLAIM);
    });
    expect(auth.promptSignIn).not.toHaveBeenCalled();
    expect(store.get(pendingActionsAtom)[0]?.onSignedOut).toMatchObject({
      prompt: { component: 'template_add_form', auth_continuation: 'queued' },
    });
  });

  it('a published draft never puts itself back in the form', async () => {
    const { result } = renderPublisher();
    const restore = vi.fn();
    await act(async () => {
      result.current.holdAddDraft(restore);
      await result.current.add(CLAIM);
    });
    expect(restore).not.toHaveBeenCalled();
  });

  it('while a new account is set up, the draft is queued and published once the personal space exists', async () => {
    role(false, false);
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isSetupPending: true });
    const { result, rerender, store, queryClient } = renderPublisher();

    let outcome: TemplateAddResult | undefined;
    let pending!: Promise<TemplateAddResult>;
    act(() => {
      pending = result.current.add(CLAIM);
    });
    void pending.then(r => (outcome = r));

    const queued = store.get(pendingActionsAtom);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ requires: 'personalSpace' });
    expect(JSON.parse(queued[0]!.intent!)).toEqual(CLAIM);
    expect(mocks.makeProposal).not.toHaveBeenCalled();

    // The space lands: the mounted hook replays the draft into it.
    Object.assign(account, { personalSpaceId: PERSONAL_SPACE, isRegistered: true, isSetupPending: false });
    queryClient.setQueryData(['personal-space-id', ADDRESS.toLowerCase()], {
      isRegistered: true,
      personalSpaceId: PERSONAL_SPACE,
      personalEntityId: null,
    });
    rerender();
    await act(async () => {
      await queued[0]!.run();
    });

    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(mocks.makeProposal.mock.calls[0]![0]).toMatchObject({ spaceId: PERSONAL_SPACE });
    expect(outcome).toMatchObject({ ok: true, spaceId: PERSONAL_SPACE });
  });

  it('a queued draft dropped by a sign-out settles as not added', async () => {
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isSetupPending: true });
    const { result, store } = renderPublisher();

    let pending!: Promise<TemplateAddResult>;
    act(() => {
      pending = result.current.add(CLAIM);
    });
    act(() => store.set(pendingActionsAtom, []));

    await expect(pending).resolves.toMatchObject({ ok: false });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('a queued draft is dropped, not published later, when the page goes away first', async () => {
    Object.assign(account, { personalSpaceId: null, isRegistered: false, isSetupPending: true });
    const { result, store, unmount } = renderPublisher();

    let pending!: Promise<TemplateAddResult>;
    act(() => {
      pending = result.current.add(CLAIM);
    });
    expect(store.get(pendingActionsAtom)).toHaveLength(1);

    unmount();
    expect(store.get(pendingActionsAtom)).toHaveLength(0);
    await expect(pending).resolves.toMatchObject({ ok: false });
  });
});
