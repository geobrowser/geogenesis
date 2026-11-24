import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Space } from '~/core/io/dto/spaces';

import { publishAtom, valuesAtom } from './atoms';
import { Publish } from './publish';

const mocks = vi.hoisted(() => ({ makeBulkProposal: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('~/core/hooks/use-publish', () => ({ useBulkPublish: () => ({ makeBulkProposal: mocks.makeBulkProposal }) }));
vi.mock('~/core/wallet/account-readiness', () => ({ useAccountAddress: () => '0xviewer' }));

afterEach(() => {
  cleanup();
  mocks.makeBulkProposal.mockReset();
});

describe('Publish (CSV import)', () => {
  it('publishes once for repeated presses while the signing account is being built', async () => {
    let finish!: () => void;
    mocks.makeBulkProposal.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
    const store = createStore();
    store.set(publishAtom, true);
    store.set(valuesAtom, [{}] as never);
    render(
      <Provider store={store}>
        <Publish spaceId="space-1" space={{} as Space} />
      </Provider>
    );

    fireEvent.change(screen.getByPlaceholderText('Name your proposal...'), { target: { value: 'Import' } });
    const button = screen.getByRole('button', { name: 'Publish' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.makeBulkProposal).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    await act(async () => finish());
    expect(button).toBeEnabled();
  });
});
