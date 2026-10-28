import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InPageTabSwitch, OverviewOnly, useInPageTabSwitch } from './in-page-tab-switch';

const search = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({ useSearchParams: () => search.params }));

const SPACE_PATH = '/space/a19c345ab9866679b001d7d2138d88a1';

function TabLink({ href, onPending }: { href: string; onPending?: () => void }) {
  const switchTabInPage = useInPageTabSwitch();
  return (
    <a href={href} onClick={event => switchTabInPage(event, href, onPending)}>
      tab
    </a>
  );
}

let pushState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame'] });
  window.history.replaceState(null, '', SPACE_PATH);
  pushState = vi.spyOn(window.history, 'pushState');
  search.params = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const click = (init?: MouseEventInit) => {
  const notPrevented = fireEvent.click(screen.getByText('tab'), init);
  vi.runAllTimers();
  return notPrevented;
};

describe('useInPageTabSwitch', () => {
  it('switches to a tab on the same page without navigating', () => {
    render(
      <>
        <InPageTabSwitch />
        <TabLink href={`${SPACE_PATH}?tabId=abc`} />
      </>
    );

    const notPrevented = click();

    expect(notPrevented).toBe(false);
    expect(pushState).toHaveBeenCalledWith(null, '', `${SPACE_PATH}?tabId=abc`);
  });

  it('marks the tab before it changes the URL', () => {
    const onPending = vi.fn();
    render(
      <>
        <InPageTabSwitch />
        <TabLink href={`${SPACE_PATH}?tabId=abc`} onPending={onPending} />
      </>
    );

    fireEvent.click(screen.getByText('tab'));

    expect(onPending).toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(pushState).toHaveBeenCalledWith(null, '', `${SPACE_PATH}?tabId=abc`);
  });

  it('navigates as before on a page that has not opted in', () => {
    render(<TabLink href={`${SPACE_PATH}?tabId=abc`} />);

    click();

    expect(pushState).not.toHaveBeenCalled();
  });

  it('navigates to Overview as before', () => {
    window.history.replaceState(null, '', `${SPACE_PATH}?tabId=abc`);
    render(
      <>
        <InPageTabSwitch />
        <TabLink href={SPACE_PATH} />
      </>
    );

    click();

    expect(pushState).not.toHaveBeenCalled();
  });

  it('navigates as before to a tab on another page', () => {
    render(
      <>
        <InPageTabSwitch />
        <TabLink href="/space/other/community?tabId=abc" />
      </>
    );

    click();

    expect(pushState).not.toHaveBeenCalled();
  });

  it('leaves a modified click to the browser', () => {
    render(
      <>
        <InPageTabSwitch />
        <TabLink href={`${SPACE_PATH}?tabId=abc`} />
      </>
    );

    click({ metaKey: true });

    expect(pushState).not.toHaveBeenCalled();
  });

  it('stops switching in place once the page that opted in is gone', () => {
    const { rerender } = render(
      <>
        <InPageTabSwitch />
        <TabLink href={`${SPACE_PATH}?tabId=abc`} />
      </>
    );
    rerender(<TabLink href={`${SPACE_PATH}?tabId=abc`} />);

    click();

    expect(pushState).not.toHaveBeenCalled();
  });
});

describe('OverviewOnly', () => {
  it('shows its content on Overview', () => {
    render(<OverviewOnly>overview rail</OverviewOnly>);

    expect(screen.getByText('overview rail')).toBeInTheDocument();
  });

  it('hides its content once a tab is open', () => {
    search.params = new URLSearchParams('tabId=abc');

    render(<OverviewOnly>overview rail</OverviewOnly>);

    expect(screen.queryByText('overview rail')).toBeNull();
  });
});
