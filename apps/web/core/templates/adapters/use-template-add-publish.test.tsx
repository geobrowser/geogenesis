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

const auth = vi.hoisted(() => ({ authenticated: true, promptSignIn: vi.fn() }));
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
  store: { setValues: vi.fn(), setRelations: vi.fn(), clearLocalChangesByIds: vi.fn() },
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
    // What is published is exactly what was written to the store.
    expect(mocks.store.setValues).toHaveBeenCalledWith(args.values);
    expect(mocks.store.setRelations).toHaveBeenCalledWith(args.relations);
    expect(
      args.relations.some((r: { type: { id: string } }) => r.type.id === TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID)
    ).toBe(true);
    expect(outcome?.ok && outcome.id).toBe(args.values[0].entity.id);
    expect(mocks.store.clearLocalChangesByIds).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
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

  it('a failed publish takes the written rows back out, so nothing is left for Review edits', async () => {
    publishes(false);
    const { result } = renderPublisher();

    let outcome: TemplateAddResult | undefined;
    await act(async () => {
      outcome = await result.current.add({ kind: 'event', draft: { title: 'Ceasefire signed', when: '2026-11-18' } });
    });

    expect(outcome).toMatchObject({ ok: false });
    const [args] = mocks.makeProposal.mock.calls[0]!;
    expect(mocks.store.clearLocalChangesByIds).toHaveBeenCalledWith({
      spaceId: PAGE_SPACE,
      valueIds: args.values.map((v: { id: string }) => v.id),
      relationIds: args.relations.map((r: { id: string }) => r.id),
    });
  });

  it('signed out, the form asks for sign-in and writes nothing', async () => {
    auth.authenticated = false;
    const { result } = renderPublisher();

    expect(result.current.canOpenAddForm()).toBe(false);
    expect(auth.promptSignIn).toHaveBeenCalledTimes(1);

    let outcome: TemplateAddResult | undefined;
    await act(async () => {
      outcome = await result.current.add(CLAIM);
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(mocks.store.setValues).not.toHaveBeenCalled();
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('signed in, the form opens', () => {
    const { result } = renderPublisher();
    expect(result.current.canOpenAddForm()).toBe(true);
    expect(auth.promptSignIn).not.toHaveBeenCalled();
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
});
