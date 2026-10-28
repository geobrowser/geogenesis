import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatJoinConfirmation } from './chat-join-confirmation';

const SPACE_ID = 'c9f267dc1b7a4f3d8e2a5b6c7d8e9f01';

afterEach(cleanup);

describe('ChatJoinConfirmation', () => {
  it('names the resolved space and sends only on the confirm button', () => {
    const onConfirm = vi.fn();
    const onDecline = vi.fn();
    render(
      <ChatJoinConfirmation request={{ target: { spaceId: SPACE_ID, spaceName: 'Crypto' }, onConfirm, onDecline }} />
    );

    expect(screen.getByText('Request to join Crypto?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Request membership' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('declines without sending', () => {
    const onConfirm = vi.fn();
    const onDecline = vi.fn();
    render(
      <ChatJoinConfirmation request={{ target: { spaceId: SPACE_ID, spaceName: 'Crypto' }, onConfirm, onDecline }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('falls back to the space id when the space has no name', () => {
    render(
      <ChatJoinConfirmation
        request={{ target: { spaceId: SPACE_ID, spaceName: undefined }, onConfirm: vi.fn(), onDecline: vi.fn() }}
      />
    );
    expect(screen.getByText(`Request to join the space ${SPACE_ID}?`)).toBeTruthy();
  });
});
