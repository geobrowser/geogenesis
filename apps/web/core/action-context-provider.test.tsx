import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, expect, it, vi } from 'vitest';

import { ActionSurface, useActionContext } from './action-context-provider';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('./analytics', () => ({ capture }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  capture.mockReset();
});

function Control({ action }: { action: (context: unknown) => void }) {
  const getContext = useActionContext('entity_vote_buttons', 'claim', 'claim');
  return <button onClick={() => action(getContext())}>Agree</button>;
}

it('joins one foreground visible impression to actions and retains its id on remount', () => {
  window.history.replaceState({}, '', '/explore/impression-test');
  let notify!: IntersectionObserverCallback;
  const observe = vi.fn();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe = observe;
      disconnect() {}
    }
  );
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const action = vi.fn();
  const tree = (
    <ActionSurface
      value={{ component: 'explore_feed_card', target_id: 'claim', target_type: 'claim', item_position: 10 }}
    >
      <Control action={action} />
    </ActionSurface>
  );
  const mounted = render(tree);
  expect(capture).not.toHaveBeenCalled();
  act(() =>
    notify([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver)
  );
  expect(capture).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  expect(capture).toHaveBeenCalledTimes(1);
  const impression = capture.mock.calls[0][1];
  fireEvent.click(screen.getByText('Agree'));
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ presentation_instance_id: impression.presentation_instance_id, item_position: 10 })
  );
  mounted.unmount();
  render(tree);
  act(() =>
    notify([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver)
  );
  expect(capture).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Agree'));
  expect(action.mock.calls[1][0].presentation_instance_id).toBe(impression.presentation_instance_id);
});
