import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PersonalSpaceProfile } from './personal-space-profile';

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'space-1' }),
}));

vi.mock('~/core/hooks/use-profile-history', () => ({
  useProfileHistory: () => ({ employment: [], education: [], isUnavailable: true }),
}));

vi.mock('~/core/debates/use-person-debates', () => ({
  usePersonDebates: () => ({ rows: [], isLoading: false, isError: false }),
}));

vi.mock('~/core/profile/use-entity-scores', () => ({
  useEntityScores: () => ({ rankings: new Map(), isLoading: false, isError: false }),
}));

vi.mock('~/core/hooks/use-profile-facts', () => ({
  useProfileFacts: () => ({
    facts: { debates: 0, positions: 0 },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('~/core/profile/use-person-positions', () => ({
  usePersonPositions: () => ({ rows: [], responseByClaimId: new Map(), isLoading: false, isError: false }),
  usePersonResponses: () => ({ isError: false, total: 0 }),
  heldPositionsCount: () => 0,
}));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map() }),
  spaceLabel: () => undefined,
}));

vi.mock('./profile-activity-section', () => ({
  ProfileActivitySection: () => <section>Activity remains visible</section>,
}));

vi.mock('./profile-record-sections', () => ({
  ProfileRecordSection: () => <section>History record</section>,
  ProfileSkillsSection: () => <section>Skills record</section>,
}));

vi.mock('./edit-record-dialog', () => ({ EditRecordDialog: () => <div>Edit history</div> }));

afterEach(cleanup);

describe('PersonalSpaceProfile partial failures', () => {
  it('keeps activity visible when employment and education cannot load', () => {
    render(<PersonalSpaceProfile spaceId="space-1" personEntityId="person-1" />);

    expect(screen.getByText('Activity remains visible')).toBeInTheDocument();
    expect(screen.getByText('We couldn’t load this profile. Try reloading the page.')).toBeInTheDocument();
    expect(screen.queryByText('History record')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit history')).not.toBeInTheDocument();
  });
});
