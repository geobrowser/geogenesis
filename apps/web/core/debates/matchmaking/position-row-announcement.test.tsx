import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { PositionRow } from './matchmaking-claim-card';

afterEach(cleanup);

const CONFIRMING = 'Response submitted. Waiting for confirmation.';

const row = (props: { pending?: boolean; announcing?: boolean }) =>
  render(
    <PositionRow
      positions={[]}
      responseKind="stance"
      viewerPosition={null}
      onRespond={() => {}}
      titleFor={position => (position ? 'Agree' : 'Disagree')}
      {...props}
    />
  );

/**
 * Every pill surface draws this component, and three of them had no announcement at all.
 */
describe('PositionRow — the confirming announcement', () => {
  it('announces once the response is in the announcing window', () => {
    row({ pending: true, announcing: true });

    const notice = screen.getByText(CONFIRMING);
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveClass('sr-only');
  });

  // One node, not one per pill: `getByText` throws on a second match, so this asserts it too.
  it('announces exactly once for the pair', () => {
    row({ pending: true, announcing: true });

    expect(screen.getAllByText(CONFIRMING)).toHaveLength(1);
  });

  it('stays silent while only pending', () => {
    row({ pending: true });

    expect(screen.queryByText(CONFIRMING)).not.toBeInTheDocument();
  });

  it('stays silent when nothing is happening', () => {
    row({});

    expect(screen.queryByText(CONFIRMING)).not.toBeInTheDocument();
  });

  // Drawn for nobody: `sr-only` is clipped, so it cannot disturb the two-column grid it sits beside.
  it('takes no layout', () => {
    const { container } = row({ pending: true, announcing: true });

    expect(container.querySelector('[aria-live]')).toHaveClass('sr-only');
  });
});
