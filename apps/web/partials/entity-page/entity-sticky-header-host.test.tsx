import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { EntityStickyHeaderHost } from './entity-sticky-header-host';
import { entityStickyHeaderHostElementAtom } from '~/atoms';

afterEach(cleanup);

describe('EntityStickyHeaderHost', () => {
  it('registers its element so the bar has somewhere to portal to', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <EntityStickyHeaderHost />
      </Provider>
    );

    expect(store.get(entityStickyHeaderHostElementAtom)).toBe(screen.getByTestId('entity-sticky-header-host'));
  });

  it('takes no height, so the bar appearing costs no layout shift', () => {
    render(
      <Provider store={createStore()}>
        <EntityStickyHeaderHost />
      </Provider>
    );

    expect(screen.getByTestId('entity-sticky-header-host')).toHaveClass('h-0');
  });

  /**
   * Under the sidebar, not level with it. The sidebar's collapse toggle overhangs this column and
   * cannot escape the sidebar's own `z-50` stacking context, so a bar at 50 or above covers it —
   * and because this element is later in the DOM, an equal layer is enough to do that.
   */
  it('sits below the browse sidebar and above the page', () => {
    render(
      <Provider store={createStore()}>
        <EntityStickyHeaderHost />
      </Provider>
    );

    const host = screen.getByTestId('entity-sticky-header-host');
    expect(host).toHaveClass('z-40');
    expect(host).not.toHaveClass('z-50');
  });
});
