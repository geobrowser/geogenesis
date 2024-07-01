import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import React from 'react';

import { MockNetworkData, Storage } from '~/core/io';
import { Providers } from '~/core/providers';
import { localTriplesAtom } from '~/core/state/actions-store/actions-store';
import { editableAtom } from '~/core/state/editable-store';
import { store } from '~/core/state/jotai-store';
import { StatusBarContext, StatusBarState } from '~/core/state/status-bar-store';

import { FlowBar } from './flow-bar';

// Most of these tests are covered by the action.test.ts file, but there are some
// other cases we want to handle, particularly for rendering the flow bar in different
// states.
describe('Flow Bar', () => {
  it('Should not render the flow bar when there are not changes', () => {
    render(
      <Providers>
        <FlowBar />
      </Providers>
    );

    expect(screen.queryByText('Review edit')).not.toBeInTheDocument();
  });

  it('Should not render the flow bar when there are changes but not in edit mode', () => {
    render(
      <Providers>
        <FlowBar />
      </Providers>
    );

    act(() =>
      store.set(localTriplesAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
        },
      ])
    );

    expect(screen.queryByText('Review edit')).not.toBeInTheDocument();
  });

  it('Should not render the flowbar when the status bar is open', () => {
    const initialState: StatusBarState = {
      reviewState: 'publish-complete',
      error: null,
    };

    const initialDispatch = () => {
      //
    };

    render(
      <Providers>
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      act(() => store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]));
    });

    expect(screen.queryByText('Review edit')).not.toBeInTheDocument();
  });

  it('Should render the flow bar when there are changes and in edit mode', () => {
    render(
      <Providers>
        <FlowBar />
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      act(() => store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]));
    });

    expect(screen.queryByRole('button')).toBeInTheDocument();
  });

  /**
   * 1. createTriple, createTriple -- This should only be considered one change
   * 2. createTriple, editTriple -- This should only be considered one change
   * 3. createTriple, deleteTriple -- This should be considered no change
   * 4. editTriple, editTriple -- This should be considered one change only if the value has changed
   * 5. editTriple, deleteTriple -- This should be considered one change
   */
  it('Should show correct counts', () => {
    render(
      <Providers>
        <FlowBar />
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      act(() => store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]));
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();

    const newTriple1 = MockNetworkData.makeStubTriple('Alice');

    // create -> create should only be one change
    act(() => {
      store.set(localTriplesAtom, [newTriple1]);
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();
  });
});

describe('Status bar', () => {
  it('should not render the status bar when status is idle or reviewing and we are in edit mode with actions', () => {
    const initialState: StatusBarState = {
      reviewState: 'idle',
      error: null,
    };

    const initialDispatch = () => {
      //
    };

    render(
      <Providers>
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]);
    });

    expect(screen.queryByText('Review edit')).toBeInTheDocument();
  });

  it('should render ipfs uploading state', () => {
    const initialState: StatusBarState = {
      reviewState: 'publishing-ipfs',
      error: null,
    };

    const initialDispatch = () => {
      //
    };

    render(
      <Providers>
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]);
    });

    expect(screen.queryByText('Uploading changes to IPFS')).toBeInTheDocument();
  });

  it('should render wallet signing state', () => {
    const initialState: StatusBarState = {
      reviewState: 'signing-wallet',
      error: null,
    };

    const initialDispatch = () => {
      //
    };

    render(
      <Providers>
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]);
    });

    expect(screen.queryByText('Sign your transaction')).toBeInTheDocument();
  });

  it('should render publishing contract state', () => {
    const initialState: StatusBarState = {
      reviewState: 'publishing-contract',
      error: null,
    };

    const initialDispatch = () => {
      //
    };

    render(
      <Providers>
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]);
    });

    expect(screen.queryByText('Adding your changes to The Graph')).toBeInTheDocument();
  });

  it('should render publish success state', () => {
    const initialState: StatusBarState = {
      reviewState: 'publish-complete',
      error: null,
    };

    const initialDispatch = () => {
      //
    };

    render(
      <Providers>
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]);
    });

    expect(screen.queryByText('Changes published!')).toBeInTheDocument();
  });

  it('should render publish error state', async () => {
    const initialState: StatusBarState = {
      reviewState: 'publish-error',
      error: 'Banana is brown.',
    };

    const initialDispatch = () => {
      //
    };

    render(
      <Providers>
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(localTriplesAtom, [MockNetworkData.makeStubTriple('Alice')]);
    });

    expect(screen.queryByText('An error has occurred')).toBeInTheDocument();
  });
});
