import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatLauncher } from './chat-launcher';

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="widget" /> }));

describe('the assistant on the graph explorer', () => {
  afterEach(cleanup);

  it.each(['/explore/graph/4ed3162278994f29bde7a6f7cf60e28e', '/explore/graph'])('is not offered on %s', pathname => {
    nav.pathname = pathname;
    render(<ChatLauncher />);
    expect(screen.queryByLabelText('Open assistant')).toBeNull();
  });

  it.each(['/explore', '/explore/graphs-of-the-week'])('is still offered on %s', pathname => {
    nav.pathname = pathname;
    render(<ChatLauncher />);
    expect(screen.getByLabelText('Open assistant')).toBeTruthy();
  });
});
