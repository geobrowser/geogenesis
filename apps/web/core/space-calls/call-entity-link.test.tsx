import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CALL_ENTITY_LINK_COPY, CallEntityLink } from './call-entity-link';

const mocks = vi.hoisted(() => ({ flag: true }));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));

describe('CallEntityLink', () => {
  afterEach(() => {
    cleanup();
    mocks.flag = true;
  });

  it('links the entity page once an entity is recorded', () => {
    render(<CallEntityLink spaceId={'a'.repeat(32)} entityId={'b'.repeat(32)} />);
    expect(screen.getByRole('link', { name: CALL_ENTITY_LINK_COPY.label }).getAttribute('href')).toContain(
      'b'.repeat(32)
    );
  });

  it('shows nothing without an entity or without the flag', () => {
    const { container, rerender } = render(<CallEntityLink spaceId="s" entityId={null} />);
    expect(container).toBeEmptyDOMElement();
    mocks.flag = false;
    rerender(<CallEntityLink spaceId="s" entityId={'b'.repeat(32)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
