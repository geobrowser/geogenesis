import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

import {
  ActionContextProvider,
  ActionSurface,
  ActionSurfaceArticle,
  ActionSurfaceDiv,
  useActionContext,
  useActionScope,
} from './action-context-provider';
import { pageViewed } from './analytics';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('./analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('./analytics')>()),
  capture,
}));
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
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

it('preserves a nested list position over the outer surface click capture', () => {
  const action = vi.fn();
  render(
    <ActionSurface
      value={{
        component: 'debate_claims_panel',
        target_id: 'debate',
        target_type: 'debate',
        list_id: 'explore',
        item_position: 10,
        target_type_ids: ['debate-type'],
      }}
    >
      <ActionContextProvider
        value={{ target_id: 'claim', target_type: 'claim', list_id: 'debate_claims', item_position: 2 }}
      >
        <Control action={action} />
      </ActionContextProvider>
    </ActionSurface>
  );
  fireEvent.click(screen.getByText('Agree'));
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({
      component: 'debate_claims_panel',
      target_id: 'claim',
      list_id: 'debate_claims',
      item_position: 2,
    })
  );
  expect(action.mock.calls[0][0]).not.toHaveProperty('target_type_ids');
});

it('measures a retained card again when the page tracker reports query-only navigation', () => {
  window.history.replaceState({}, '', '/explore?tab=claims');
  let notify!: IntersectionObserverCallback;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  const action = vi.fn();
  render(
    <ActionSurface value={{ component: 'explore_feed_card', target_id: 'claim', target_type: 'claim' }}>
      <Control action={action} />
    </ActionSurface>
  );
  const show = () =>
    act(() =>
      notify([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver)
    );
  show();
  const first = capture.mock.calls[0][1];
  window.history.replaceState({}, '', '/explore?tab=debates');
  // Next retains the card subtree; no manual rerender or remount here.
  act(() => pageViewed());
  show();
  expect(capture).toHaveBeenCalledTimes(2);
  const second = capture.mock.calls[1][1];
  expect(second.page_view_id).not.toBe(first.page_view_id);
  expect(second.presentation_instance_id).not.toBe(first.presentation_instance_id);
  expect(second.page_path).toBe('/explore');
  fireEvent.click(screen.getByText('Agree'));
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({
      page_view_id: second.page_view_id,
      presentation_instance_id: second.presentation_instance_id,
    })
  );
  show();
  expect(capture).toHaveBeenCalledTimes(2);
});

// The child swaps its own root after data resolves; the enclosing surface stays mounted.
it.each(['asChild', 'div', 'contents'] as const)(
  'follows a replaced %s measurement root without counting it twice',
  async mode => {
    window.history.replaceState({}, '', `/explore/replacement-${mode}`);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const observers: {
      notify: IntersectionObserverCallback;
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(notify: IntersectionObserverCallback) {
          observers.push({ notify, observe: this.observe, disconnect: this.disconnect });
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    const action = vi.fn();
    const forwardedRef = React.createRef<HTMLDivElement>();
    function ReplacingChild() {
      const [revision, setRevision] = React.useState(0);
      const Article = mode === 'asChild' ? ActionSurfaceArticle : mode === 'div' ? ActionSurfaceDiv : 'article';
      return (
        <Article key={revision} ref={forwardedRef} data-testid="measured-root">
          <button onClick={() => setRevision(value => value + 1)}>Replace root</button>
          <Control action={action} />
        </Article>
      );
    }
    render(
      <ActionSurface
        asChild={mode !== 'contents'}
        className={mode === 'contents' ? 'contents' : undefined}
        value={{ component: 'explore_feed_card', target_id: 'claim', target_type: 'claim' }}
      >
        <ReplacingChild />
      </ActionSurface>
    );
    const oldRoot = screen.getByTestId('measured-root');
    const first = observers.at(-1)!;
    expect(first.observe).toHaveBeenLastCalledWith(oldRoot);
    await act(async () => {
      fireEvent.click(screen.getByText('Replace root'));
    });
    const newRoot = screen.getByTestId('measured-root');
    expect(newRoot).not.toBe(oldRoot);
    expect(forwardedRef.current).toBe(newRoot);
    expect(first.disconnect).toHaveBeenCalled();
    const replacement = observers.at(-1)!;
    expect(replacement.observe).toHaveBeenLastCalledWith(newRoot);
    const show = (observer: typeof first, target: Element) =>
      act(() =>
        observer.notify(
          [{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
          {} as IntersectionObserver
        )
      );
    // A queued notification from the detached root must not manufacture an impression.
    show(first, oldRoot);
    expect(capture).not.toHaveBeenCalled();
    show(replacement, newRoot);
    expect(capture).toHaveBeenCalledTimes(1);
    const impression = capture.mock.calls[0][1];
    fireEvent.click(screen.getByText('Agree'));
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        presentation_instance_id: impression.presentation_instance_id,
      })
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Replace root'));
    });
    show(observers.at(-1)!, screen.getByTestId('measured-root'));
    expect(capture).toHaveBeenCalledTimes(1);
  }
);

it('does not allocate or retain per-entity display IDs during repeated server renders', () => {
  const uuid = vi.spyOn(crypto, 'randomUUID');
  const writes = vi.spyOn(Map.prototype, 'set');
  function Probe() {
    const scope = useActionScope();
    return <span data-display={scope.presentation_instance_id}>Card</span>;
  }
  for (let index = 0; index < 20; index++) {
    const html = renderToString(
      <ActionSurface value={{ component: 'explore_feed_card', target_type: 'entity', target_id: `ssr-leak-${index}` }}>
        <Probe />
      </ActionSurface>
    );
    expect(html).not.toContain('data-display');
  }
  expect(uuid).not.toHaveBeenCalled();
  expect(writes.mock.calls.filter(([key]) => typeof key === 'string' && key.includes('ssr-leak-'))).toEqual([]);
});

it('allocates a client display after hydration and joins its impression to actions', async () => {
  window.history.replaceState({}, '', '/explore/hydration');
  let notify!: IntersectionObserverCallback;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  const action = vi.fn();
  const error = vi.fn();
  const tree = (
    <ActionSurface asChild value={{ component: 'explore_feed_card', target_id: 'claim', target_type: 'claim' }}>
      <ActionSurfaceDiv>
        <Control action={action} />
      </ActionSurfaceDiv>
    </ActionSurface>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.append(container);
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: error });
    });
    act(() =>
      notify([{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver)
    );
    expect(error).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledOnce();
    const display = capture.mock.calls[0][1].presentation_instance_id;
    expect(display).toEqual(expect.any(String));
    expect(display).not.toBe('');
    fireEvent.click(screen.getByText('Agree'));
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ presentation_instance_id: display }));
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});
