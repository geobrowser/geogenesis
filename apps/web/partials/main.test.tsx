import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Main } from './main';
import { debateFullscreenActiveAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({ pathname: '/space/space-1/entity-1' }));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('~/core/state/diff-store', () => ({ useDiff: () => ({ isReviewOpen: false }) }));

let store: ReturnType<typeof createStore>;

beforeEach(() => {
  mocks.pathname = '/space/space-1/entity-1';
  store = createStore();
});

afterEach(cleanup);

function renderMain() {
  render(
    <Provider store={store}>
      <Main>
        <div data-testid="page" />
      </Main>
    </Provider>
  );
  const main = screen.getByTestId('page').parentElement;
  if (!main) throw new Error('Expected Main to wrap its children');
  return main;
}

// The page chrome makes the document taller than the viewport. Around a viewport-filling
// takeover that lets the whole thing scroll up under the sticky navbar, clipping the debate.
const CHROME = ['mx-auto', 'max-w-[1200px]', 'pt-8', 'pb-16'];

describe('Main', () => {
  it('wraps an ordinary entity page in the page chrome', () => {
    expect(renderMain()).toHaveClass(...CHROME);
  });

  // A Debate entity page renders the feed from a route that looks like any other entity page,
  // so the pathname can't distinguish it — the view raises this flag instead.
  it('drops the chrome while a full-screen debate is on that same route', () => {
    store.set(debateFullscreenActiveAtom, true);
    const main = renderMain();

    expect(main).toHaveClass('min-w-0', 'flex-1');
    for (const className of CHROME) expect(main).not.toHaveClass(className);
  });

  it('keeps the chrome off routes that are already full-width', () => {
    mocks.pathname = '/space/space-1/debates';
    const main = renderMain();

    // Individually: `not.toHaveClass(a, b)` only fails when *every* class is present, so the
    // spread form would still pass if one chrome class crept back.
    for (const className of CHROME) expect(main).not.toHaveClass(className);
  });
});
