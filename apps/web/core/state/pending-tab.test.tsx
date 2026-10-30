import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { TabContentPending, usePendingTab } from './pending-tab';

afterEach(cleanup);

let rows: Record<string, ReturnType<typeof usePendingTab>> = {};

function Row({ name, fullPath = '/space/a' }: { name: string; fullPath?: string }) {
  rows[name] = usePendingTab(fullPath);
  return null;
}

function Content() {
  return (
    <TabContentPending fallback={<p>loading</p>}>
      <p>content</p>
    </TabContentPending>
  );
}

describe('usePendingTab', () => {
  it('clears the pending tab when the row that set it unmounts', () => {
    rows = {};
    const { rerender } = render(
      <>
        <Row name="page" />
        <Content />
      </>
    );
    act(() => rows.page.handlePendingChange('/space/a?tabId=b', true));
    expect(screen.getByText('loading')).toBeInTheDocument();

    rerender(<Content />);

    expect(screen.queryByText('loading')).toBeNull();
  });

  it('keeps the pending tab when another row unmounts', () => {
    rows = {};
    const { rerender } = render(
      <>
        <Row name="page" />
        <Row name="panel" />
        <Content />
      </>
    );
    act(() => rows.page.handlePendingChange('/space/a?tabId=b', true));

    rerender(
      <>
        <Row name="page" />
        <Content />
      </>
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('keeps a pending tab to the row it was clicked in', () => {
    rows = {};
    render(
      <>
        <Row name="page" />
        <Row name="panel" />
      </>
    );

    act(() => rows.page.handlePendingChange('/space/a?tabId=b', true));

    expect(rows.page.pendingHref).toBe('/space/a?tabId=b');
    expect(rows.panel.pendingHref).toBeNull();
  });

  it('clears the pending tab once the URL reaches it', () => {
    rows = {};
    const { rerender } = render(
      <>
        <Row name="page" />
        <Content />
      </>
    );
    act(() => rows.page.handlePendingChange('/space/a?tabId=b', true));

    rerender(
      <>
        <Row name="page" fullPath="/space/a?tabId=b" />
        <Content />
      </>
    );

    expect(screen.queryByText('loading')).toBeNull();
  });
});
