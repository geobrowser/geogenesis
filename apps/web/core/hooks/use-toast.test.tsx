import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Provider } from 'jotai';
import { describe, expect, it } from 'vitest';

import { Toast, useToast } from './use-toast';

function TopToastTrigger() {
  const [, setToast] = useToast({ placement: 'top' });

  return <button onClick={() => setToast(<span>Hidden debate saved</span>)}>Show toast</button>;
}

describe('Toast placement', () => {
  it('renders a requested top toast at the publishing-status anchor', () => {
    render(
      <Provider>
        <TopToastTrigger />
        <Toast />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show toast' }));

    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveClass('top-0');
    expect(liveRegion).not.toHaveClass('bottom-0');
    expect(screen.getByText('Hidden debate saved')).toBeInTheDocument();
  });
});
