import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BestDebateThumb, BestDebateWatchContext } from './best-debate-row';

afterEach(cleanup);

describe('BestDebateThumb', () => {
  it('opens the debate to watch, and the row it sits in does not act on the press', () => {
    const watch = vi.fn();
    const onRow = vi.fn();
    render(
      <BestDebateWatchContext.Provider value={watch}>
        <div role="button" tabIndex={0} onClick={onRow}>
          <BestDebateThumb entityId="d1" keyframeUrl={null} label="Tariffs hurt farmers" />
        </div>
      </BestDebateWatchContext.Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Watch Tariffs hurt farmers' }));
    expect(watch).toHaveBeenCalledWith('d1', 'poster');
    expect(onRow).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Watch Tariffs hurt farmers' }), { key: 'Enter' });
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('is only a picture where nothing can open it', () => {
    render(<BestDebateThumb entityId="d1" keyframeUrl={null} label="Tariffs hurt farmers" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
