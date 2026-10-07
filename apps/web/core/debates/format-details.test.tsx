import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { DebateFormatDetails, requestOpenRounds } from './format-details';

const participants = [
  { user_id: 'user-local', profile_space_id: 'profile-local', display_name: 'Local speaker', avatar_cid: null },
  { user_id: 'user-remote', profile_space_id: 'profile-remote', display_name: 'Remote speaker', avatar_cid: null },
];

afterEach(cleanup);

function renderDetails(props: Partial<React.ComponentProps<typeof DebateFormatDetails>>) {
  return render(
    <DebateFormatDetails formatId="standard" participants={participants} currentUserId="user-local" {...props} />
  );
}

describe('DebateFormatDetails', () => {
  it('shows Open rounds as two opening turns and optional rebuttal rounds, with the debate’s cap', () => {
    const { container } = renderDetails({
      formatId: 'open_rounds',
      openRounds: { max_rebuttal_rounds: 3, rebuttal_turn_ms: 45_000 },
    });

    expect(screen.getByText('You make an argument')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker makes an argument')).toBeInTheDocument();
    expect(screen.getAllByText('1m')).toHaveLength(2);
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('Then extend, round by round')).toBeInTheDocument();
    expect(screen.getByText('A round happens only if you both pick Extend. Up to 3 rounds.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/clos/i);
  });

  it('reads Open rounds, and its rebuttal length, from the block even when the format id is missing', () => {
    const { container } = renderDetails({
      formatId: null,
      openRounds: { max_rebuttal_rounds: 10, rebuttal_turn_ms: 30_000 },
    });

    expect(screen.getByText('30s')).toBeInTheDocument();
    expect(screen.getByText('A round happens only if you both pick Extend. Up to 10 rounds.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/clos/i);
  });

  // GEO-3201: the server decides the format and cap when the request is made.
  it('shows the cap a pending request carries', () => {
    renderDetails({ formatId: 'open_rounds', openRounds: requestOpenRounds(4) });

    expect(screen.getByText('A round happens only if you both pick Extend. Up to 4 rounds.')).toBeInTheDocument();
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('builds no Open rounds block for a request without a cap', () => {
    expect(requestOpenRounds(null)).toBeNull();
    expect(requestOpenRounds(undefined)).toBeNull();
    expect(requestOpenRounds(0)).toEqual({ max_rebuttal_rounds: 0, rebuttal_turn_ms: 45_000 });
  });

  // A request from an older server carries no cap; a number would be a guess.
  it('names no cap for an Open rounds request without one', () => {
    const { container } = renderDetails({ formatId: 'open_rounds' });

    expect(screen.getByText('A round happens only if you both pick Extend.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Up to/);
    expect(container.textContent).not.toMatch(/clos/i);
  });

  it('never shows another format’s turns for a format it does not know', () => {
    const { container } = renderDetails({ formatId: 'some-future-format' });

    expect(screen.getByText(/can’t show this debate’s format/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/makes an argument|rebuts|clos/i);
  });

  it('keeps the fixed formats’ turn lists', () => {
    renderDetails({ formatId: 'standard' });

    expect(screen.getByText('You make an argument')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker rebuts')).toBeInTheDocument();
    expect(screen.getByText('Remote speaker closes to the audience')).toBeInTheDocument();
    expect(screen.queryByText('Then extend, round by round')).not.toBeInTheDocument();
  });
});
