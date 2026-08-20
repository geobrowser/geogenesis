import { fireEvent, render } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { ContextMeter } from './context-meter';

// No global cleanup is configured for this suite, so queries are scoped to each
// render's own container rather than the document.
function renderMeter(props: { fraction: number; onCompact?: () => void }) {
  const { container } = render(<ContextMeter {...props} />);
  const button = container.querySelector('button');
  if (!button) throw new Error('meter did not render a button');
  const arc = container.querySelectorAll('circle')[1];
  return { button, arc };
}

describe('ContextMeter', () => {
  it('reports how full the chat is', () => {
    const { button } = renderMeter({ fraction: 0.5, onCompact: () => {} });

    expect(button.getAttribute('aria-label')).toContain('50%');
  });

  it('summarizes when clicked', () => {
    const onCompact = vi.fn();
    const { button } = renderMeter({ fraction: 0.6, onCompact });

    fireEvent.click(button);

    expect(onCompact).toHaveBeenCalledOnce();
  });

  it('stays visible but inert while a turn is running', () => {
    // The reading keeps climbing mid-turn, so the ring must not vanish the
    // moment the user sends a message — but summarizing a chat that is still
    // being written would strand the rest of the turn.
    const { button } = renderMeter({ fraction: 0.6 });

    expect(button.disabled).toBe(true);
  });

  it('never renders an arc outside the ring', () => {
    // contextTokens can overshoot the threshold before compaction lands, which
    // would otherwise give a negative dash offset and a mis-drawn circle.
    const { button, arc } = renderMeter({ fraction: 1.8, onCompact: () => {} });

    expect(button.getAttribute('aria-label')).toContain('100%');
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBe(0);
  });

  it('draws an empty ring at a zero reading', () => {
    const { arc } = renderMeter({ fraction: 0, onCompact: () => {} });
    const circumference = Number(arc.getAttribute('stroke-dasharray'));

    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference);
  });
});
