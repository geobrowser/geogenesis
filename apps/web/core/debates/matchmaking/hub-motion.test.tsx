import { render, screen } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { HubPinnedSlot, hubRowMotion } from './hub-motion';

describe('HubPinnedSlot', () => {
  it('renders nothing at all when the slot is empty', () => {
    const { container } = render(<HubPinnedSlot>{null}</HubPinnedSlot>);
    expect(container.innerHTML).toBe('');
  });

  it('clips the card it holds so an animating height cannot spill over the filters', () => {
    render(
      <HubPinnedSlot>
        <article>Awaiting response</article>
      </HubPinnedSlot>
    );

    const wrapper = screen.getByText('Awaiting response').parentElement;
    expect(wrapper?.className).toContain('overflow-hidden');
  });
});

describe('hubRowMotion', () => {
  it('does not define an exit, so a filtered-out row leaves immediately', () => {
    expect(hubRowMotion).not.toHaveProperty('exit');
  });

  it('animates layout so a row that changes place slides instead of jumping', () => {
    expect(hubRowMotion.layout).toBe(true);
  });
});
