import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { FollowerCount } from './follow-control';

describe('FollowerCount', () => {
  afterEach(cleanup);

  it('draws the number beside an icon and reads as "N following"', () => {
    const { container } = render(<FollowerCount count={1234} />);

    expect(screen.getByText('1,234 following')).toHaveClass('sr-only');
    expect(screen.getByText('1,234')).toHaveAttribute('aria-hidden');
    expect(container.firstElementChild).toHaveAttribute('title', '1,234 following');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('draws nothing at zero or while loading', () => {
    expect(render(<FollowerCount count={0} />).container).toBeEmptyDOMElement();
    expect(render(<FollowerCount count={null} />).container).toBeEmptyDOMElement();
  });
});
