import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityPageInlineDescription } from './entity-page-inline-description';

const LONG_DESCRIPTION =
  'A description long enough that it would run past three lines in the narrow side panel, ' +
  'which is the whole reason it needs the same More/Less treatment the entity page already gives it.';

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => false }));
vi.mock('~/core/sync/use-mutate', () => ({ useMutate: () => ({ storage: { values: {} } }) }));
vi.mock('~/core/sync/use-store', () => ({ useValue: () => undefined }));

afterEach(cleanup);

/**
 * The side panel used to opt out of clamping with `truncate={false}`, so the same
 * description rendered fully there and clamped on the entity page. Both surfaces now
 * render this one component with no opt-out.
 *
 * jsdom reports every box as zero-sized, so ClampedText's overflow measurement can't
 * run and the More button never appears here. The clamp class is applied regardless of
 * measurement, so that is what these assert.
 */
describe('EntityPageInlineDescription', () => {
  it('clamps a long description to three lines', () => {
    render(<EntityPageInlineDescription entityId="e1" spaceId="s1" fallbackDescription={LONG_DESCRIPTION} />);

    expect(screen.getByText(LONG_DESCRIPTION)).toHaveClass('line-clamp-3');
  });

  it('renders nothing without a description', () => {
    const { container } = render(<EntityPageInlineDescription entityId="e1" spaceId="s1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
