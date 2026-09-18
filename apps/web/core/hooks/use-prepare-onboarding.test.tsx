import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/space/space-1/debates',
  useSearchParams: () => new URLSearchParams('tab=open&sort=best'),
}));

import { useAtomValue, useSetAtom } from 'jotai';

import {
  avatarAtom,
  nameAtom,
  selectedTopicIdsAtom,
  spaceIdAtom,
  stepAtom,
  topicIdAtom,
} from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

import { usePrepareOnboarding } from './use-prepare-onboarding';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** Renders the hook alongside everything it is supposed to touch. */
function setup() {
  return renderHook(() => ({
    prepare: usePrepareOnboarding(),
    setSelectedTopicIds: useSetAtom(selectedTopicIdsAtom),
    setName: useSetAtom(nameAtom),
    setTopicId: useSetAtom(topicIdAtom),
    setAvatar: useSetAtom(avatarAtom),
    setSpaceId: useSetAtom(spaceIdAtom),
    setStep: useSetAtom(stepAtom),
    setRedirect: useSetAtom(postOnboardingRedirectAtom),
    redirect: useAtomValue(postOnboardingRedirectAtom),
    name: useAtomValue(nameAtom),
    topicId: useAtomValue(topicIdAtom),
    avatar: useAtomValue(avatarAtom),
    spaceId: useAtomValue(spaceIdAtom),
    step: useAtomValue(stepAtom),
    selectedTopicIds: useAtomValue(selectedTopicIdsAtom),
  }));
}

describe('usePrepareOnboarding', () => {
  // Four sign-in entry points depend on this now, so a regression here is a regression everywhere.
  it('clears every persisted onboarding field', () => {
    const { result } = setup();

    // Every field seeded, not just one. These atoms default to exactly the values the reset
    // produces, so anything left unseeded is asserted against a fresh store and would pass with its
    // reset deleted — which is what the first two versions of this test did, one field at a time.
    act(() => {
      result.current.setName('Someone else');
      result.current.setTopicId('topic-from-before');
      result.current.setAvatar('https://example.com/someone-else.png');
      result.current.setSpaceId('space-from-before');
      result.current.setStep('interested-in');
    });
    expect(result.current.step).toBe('interested-in');

    act(() => {
      result.current.prepare();
    });

    expect(result.current.name).toBe('');
    expect(result.current.topicId).toBe('');
    expect(result.current.avatar).toBe('');
    expect(result.current.spaceId).toBe('');
    expect(result.current.step).toBe('start');
  });

  // The one every hand-written version of this reset forgot. It is persisted, and
  // `PendingPersonalSpaceRunner` turns it into membership proposals for the new personal space — so
  // leaving it would hand one person's abandoned interests to the next account on this browser.
  it('clears the selected topics, which only sign-out used to', () => {
    const { result } = setup();

    // An abandoned run's picks, sitting in storage where the next sign-in will find them.
    act(() => {
      result.current.setSelectedTopicIds(['topic-a', 'topic-b']);
    });
    expect(result.current.selectedTopicIds).toEqual(['topic-a', 'topic-b']);

    act(() => {
      result.current.prepare();
    });

    expect(result.current.selectedTopicIds).toEqual([]);
  });

  describe('the redirect', () => {
    it('defaults to the page they pressed on, query string and all', () => {
      const { result } = setup();

      act(() => {
        result.current.prepare();
      });

      expect(result.current.redirect).toBe('/space/space-1/debates?tab=open&sort=best');
    });

    it('takes an explicit destination when the caller has one', () => {
      const { result } = setup();

      act(() => {
        result.current.prepare({ returnTo: '/somewhere/else' });
      });

      expect(result.current.redirect).toBe('/somewhere/else');
    });

    // The navbar's button signs you in from anywhere rather than returning you anywhere, so it
    // clears the destination. `null` has to mean that rather than falling through to the default —
    // an easy thing to get wrong with `??`, and the reason this case is spelled out.
    // Two callers track their own destination and would be fighting this one:
    // `use-ranking-compose-access.ts` holds it in a ref, and `sign-in-prompt.tsx` has never set it.
    it('leaves the destination untouched when asked to keep it', () => {
      const { result } = setup();
      act(() => {
        result.current.setRedirect('/set/by/somebody/else');
      });

      act(() => {
        result.current.prepare({ keepReturnTo: true });
      });

      expect(result.current.redirect).toBe('/set/by/somebody/else');
      // The fields are still reset — keeping the destination is the only difference.
      expect(result.current.step).toBe('start');
    });

    it('clears the destination when given null, rather than falling back to the current page', () => {
      const { result } = setup();

      act(() => {
        result.current.prepare({ returnTo: null });
      });

      expect(result.current.redirect).toBeNull();
    });
  });
});
