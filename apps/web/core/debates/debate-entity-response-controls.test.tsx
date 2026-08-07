import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateEntityResponseControls } from './debate-entity-response-controls';

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ responseKind }: { responseKind?: 'stance' | 'veracity' | null }) => (
    <span>{responseKind ?? 'unavailable'}</span>
  ),
}));

afterEach(cleanup);

describe('DebateEntityResponseControls', () => {
  it('passes the backend response kind to the shared response controls', () => {
    render(<DebateEntityResponseControls entityId="claim-1" spaceId="space-1" responseKind="veracity" />);

    expect(screen.getByText('veracity')).toBeInTheDocument();
  });

  it('preserves an unavailable backend response kind instead of inferring curation', () => {
    render(<DebateEntityResponseControls entityId="claim-1" spaceId="space-1" responseKind={null} />);

    expect(screen.getByText('unavailable')).toBeInTheDocument();
  });
});
