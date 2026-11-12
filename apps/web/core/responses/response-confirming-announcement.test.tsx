import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { RESPONSE_CONFIRMING_COPY } from '~/core/responses/entity-response';

import { ResponseConfirmingAnnouncement, useAnnounceResponseConfirmed } from './response-confirming-announcement';

function AnnounceTrigger() {
  const announce = useAnnounceResponseConfirmed();
  return <button onClick={announce}>Announce</button>;
}

async function waitAFrame() {
  await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}

afterEach(cleanup);

describe('ResponseConfirmingAnnouncement', () => {
  it('speaks the confirming sentence in a polite, hidden live region', async () => {
    render(
      <Provider>
        <AnnounceTrigger />
        <ResponseConfirmingAnnouncement />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Announce' }));
    await waitAFrame();

    const notice = await screen.findByText(RESPONSE_CONFIRMING_COPY);
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveClass('sr-only');
  });

  it('re-announces the same sentence on a second call', async () => {
    render(
      <Provider>
        <AnnounceTrigger />
        <ResponseConfirmingAnnouncement />
      </Provider>
    );

    const button = screen.getByRole('button', { name: 'Announce' });
    fireEvent.click(button);
    await waitAFrame();
    expect(screen.getByText(RESPONSE_CONFIRMING_COPY)).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByText(RESPONSE_CONFIRMING_COPY)).not.toBeInTheDocument();

    await waitAFrame();
    expect(screen.getByText(RESPONSE_CONFIRMING_COPY)).toBeInTheDocument();
  });
});
