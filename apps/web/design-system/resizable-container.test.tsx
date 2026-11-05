import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { MotionConfig } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResizeObserverStub } from '~/core/debates/resize-observer-fixtures';

// jsdom runs every Framer animation to its end at once, so what the container asks Framer for is
// what there is to check: the real `MotionConfig` and reduced-motion hook, and a `motion.div` that
// records its props.
const recorded = vi.hoisted(() => ({ props: [] as Array<{ animate?: unknown; transition?: unknown }> }));
vi.mock('framer-motion', async importOriginal => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    motion: {
      div: ({
        children,
        animate,
        transition,
      }: React.PropsWithChildren<{ animate?: unknown; transition?: unknown }>) => {
        recorded.props.push({ animate, transition });
        return <div>{children}</div>;
      },
    },
  };
});

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const { ResizableContainer } = await import('./resizable-container');

const lastProps = () => recorded.props.at(-1)!;

beforeEach(() => {
  recorded.props = [];
});

afterEach(cleanup);

describe('ResizableContainer', () => {
  it('grows from nothing on mount by default, as a popover opening does', () => {
    render(<ResizableContainer>Body</ResizableContainer>);
    expect(lastProps().animate).toEqual({ height: 0 });
    expect(lastProps().transition).toEqual({ duration: 0.1 });
  });

  it('starts at its natural height when it should not grow on mount', () => {
    render(<ResizableContainer growOnMount={false}>Body</ResizableContainer>);
    expect(lastProps().animate).toEqual({ height: 'auto' });
  });

  it('takes a whole transition in place of a duration', () => {
    render(<ResizableContainer transition={{ duration: 0.24, ease: 'easeOut' }}>Body</ResizableContainer>);
    expect(lastProps().transition).toEqual({ duration: 0.24, ease: 'easeOut' });
  });

  it('changes height at once under a reduced-motion config', () => {
    render(
      <MotionConfig reducedMotion="always">
        <ResizableContainer transition={{ duration: 0.24 }}>Body</ResizableContainer>
      </MotionConfig>
    );
    expect(lastProps().transition).toEqual({ duration: 0 });
  });
});
