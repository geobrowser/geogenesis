import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DebateEntityResponseControls } from './debate-entity-response-controls';

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ showProcessingLabel }: { showProcessingLabel?: boolean }) => (
    <span>{showProcessingLabel ? 'Visible processing label enabled' : 'Hidden processing label'}</span>
  ),
}));

afterEach(cleanup);

describe('DebateEntityResponseControls', () => {
  it('requests a visible response-processing state in debate contexts', () => {
    render(<DebateEntityResponseControls entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByText('Visible processing label enabled')).toBeInTheDocument();
  });
});
