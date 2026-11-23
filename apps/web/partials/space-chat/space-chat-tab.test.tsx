import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ chat: true }));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.chat }));
vi.mock('./space-channels', () => ({ SpaceChannels: () => <div data-testid="channels" /> }));

const { CHAT_TAB_COPY, SpaceChatTab } = await import('./space-chat-tab');

afterEach(cleanup);

describe('SpaceChatTab', () => {
  it('is the channels view with space chat on', () => {
    mocks.chat = true;
    render(<SpaceChatTab spaceId="space-1" />);
    expect(screen.getByTestId('channels')).toBeInTheDocument();
  });

  it('says chat is not available with it off', () => {
    mocks.chat = false;
    render(<SpaceChatTab spaceId="space-1" />);
    expect(screen.getByText(CHAT_TAB_COPY.off)).toBeInTheDocument();
    expect(screen.queryByTestId('channels')).not.toBeInTheDocument();
  });
});
