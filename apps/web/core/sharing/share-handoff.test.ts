import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionContext } from '~/core/action-context';

import { copyShareLink, observeShareLinkHandoff } from './share-handoff';
import { createShareLink } from './share-link';

const mocks = vi.hoisted(() => ({ capture: vi.fn(), revision: 0 }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => mocks.revision }));
const target = '11111111111141118111111111111111';
const profile = '22222222222242228222222222222222';
const context = {
  component: 'share_dialog',
  page_path: '/explore',
  page_type: 'explore',
  page_view_id: 'page',
  target_id: target,
  target_type: 'space',
} as ActionContext;

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.revision = 0;
});
afterEach(() => {
  delete window.lytics;
  vi.restoreAllMocks();
});

describe('link handoffs', () => {
  it('snapshots another calendar owner separately from the sharer, then records once after copying', async () => {
    window.lytics = {
      getContext: () => ({ is_identified: true }),
      getIdentity: () => ({ personal_space_id: profile }),
    };
    let resolve!: () => void;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(
          () =>
            new Promise<void>(yes => {
              resolve = yes;
            })
        ),
      },
    });
    const link = createShareLink(
      `https://geobrowser.io/space/${target}?modal=availability&via=share`,
      'availability',
      target,
      'copy_link'
    );
    const promise = copyShareLink(link, context);
    expect(mocks.capture).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/search');
    resolve();
    await promise;
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
      'share_link_handoff',
      expect.objectContaining({
        ...link.attribution,
        sharer_profile_space_id: profile,
        sharer_role: 'unknown',
        page_path: '/explore',
        handoff_kind: 'copied',
      })
    );
    expect(link.url).not.toContain(profile);
  });

  it.each(['anonymous', 'unknown', 'debater', 'other'] as const)(
    'records the %s sharer category without extra lookups',
    role => {
      window.lytics = {
        getContext: () => ({ is_identified: role !== 'anonymous' }),
        getIdentity: () => (role === 'anonymous' || role === 'unknown' ? null : { personal_space_id: profile }),
      };
      const handoff = observeShareLinkHandoff(
        createShareLink('https://geobrowser.io/explore', 'debate', target, 'x'),
        context,
        role === 'other' ? [target] : [profile]
      );
      handoff('composer_requested');
      handoff('composer_requested');
      expect(mocks.capture).toHaveBeenCalledOnce();
      expect(mocks.capture.mock.calls[0][1].sharer_role).toBe(role);
    }
  );

  it('does not count clipboard failures or completion after an account switch', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const link = createShareLink('https://geobrowser.io/explore', 'lobby', target, 'copy_link');
    await expect(copyShareLink(link, context)).rejects.toThrow('denied');
    const complete = observeShareLinkHandoff(link, context);
    mocks.revision++;
    complete('copied');
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it.each([{ participants: [] }, { participants: ['invalid-profile'] }, { participants: [target, 'invalid-profile'] }])(
    'keeps an incomplete participant comparison unknown: %j',
    ({ participants }) => {
      window.lytics = {
        getContext: () => ({ is_identified: true }),
        getIdentity: () => ({ personal_space_id: profile }),
      };
      observeShareLinkHandoff(
        createShareLink('https://geobrowser.io/explore', 'debate', target, 'x'),
        context,
        participants
      )('composer_requested');
      expect(mocks.capture.mock.calls[0][1].sharer_role).toBe('unknown');
    }
  );

  it('does not attach stale profile traits when the context is anonymous', () => {
    const identity = vi.fn(() => ({ personal_space_id: profile }));
    window.lytics = { getContext: () => ({ is_identified: false }), getIdentity: identity };
    observeShareLinkHandoff(createShareLink('https://geobrowser.io/explore', 'debate', target, 'x'), context, [
      profile,
    ])('composer_requested');
    expect(mocks.capture.mock.calls[0][1]).toMatchObject({ sharer_role: 'anonymous' });
    expect(mocks.capture.mock.calls[0][1]).not.toHaveProperty('sharer_profile_space_id');
    expect(identity).not.toHaveBeenCalled();
  });

  it('does not turn a collector failure into a clipboard failure', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mocks.capture.mockImplementation(() => {
      throw new Error('collector unavailable');
    });
    await expect(
      copyShareLink(createShareLink('https://geobrowser.io/explore', 'lobby', target, 'copy_link'), context)
    ).resolves.toBeUndefined();
  });
});
