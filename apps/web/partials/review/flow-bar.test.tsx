import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import React from 'react';

import { options } from '~/core/environment/environment';
import { MockNetworkData, Storage } from '~/core/io';
import { Providers } from '~/core/providers';
import { actionsAtom } from '~/core/state/actions-store/actions-store';
import { editableAtom } from '~/core/state/editable-store';
import { store } from '~/core/state/jotai-provider';
import { StatusBarContext, StatusBarState } from '~/core/state/status-bar-store';
import { CreateTripleAction, DeleteTripleAction, EditTripleAction } from '~/core/types';

import { FlowBar } from './flow-bar';

// Most of these tests are covered by the action.test.ts file, but there are some
// other cases we want to handle, particularly for rendering the flow bar in different
// states.
describe('Flow Bar', () => {
  it('Should not render the flow bar when there are not changes', () => {
    render(
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <FlowBar />
      </Providers>
    );

    expect(screen.queryByText('Review edit')).not.toBeInTheDocument();
  });

  it('Should not render the flow bar when there are changes but not in edit mode', () => {
    render(
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <FlowBar />
      </Providers>
    );

    act(() =>
      store.set(actionsAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
          type: 'createTriple',
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      act(() =>
        store.set(actionsAtom, [
          {
            ...MockNetworkData.makeStubTriple('Alice'),
            type: 'createTriple',
          },
        ])
      );
    });

    expect(screen.queryByText('Review edit')).not.toBeInTheDocument();
  });

  it('Should render the flow bar when there are changes and in edit mode', () => {
    render(
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <FlowBar />
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      act(() =>
        store.set(actionsAtom, [
          {
            ...MockNetworkData.makeStubTriple('Alice'),
            type: 'createTriple',
          },
        ])
      );
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <FlowBar />
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      act(() =>
        store.set(actionsAtom, [
          {
            ...MockNetworkData.makeStubTriple('Alice'),
            type: 'createTriple',
          },
        ])
      );
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();

    const newAction1: CreateTripleAction = {
      ...MockNetworkData.makeStubTriple('Alice'),
      type: 'createTriple',
    };

    // create -> create should only be one change
    act(() => {
      store.set(actionsAtom, [newAction1]);
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();

    const newAction2: DeleteTripleAction = {
      ...MockNetworkData.makeStubTriple('Alice'),
      type: 'deleteTriple',
    };

    // create -> delete should be 0 changes
    act(() => {
      store.set(actionsAtom, [newAction1, newAction2]);
    });

    expect(screen.queryByText('Review edit')).not.toBeInTheDocument();

    const newAction3: EditTripleAction = {
      id: '',
      type: 'editTriple',
      before: {
        ...newAction1,
        type: 'deleteTriple',
      },
      after: { ...newAction1, value: { ...newAction1.value, id: 'Bob' }, type: 'createTriple' },
    };

    // create -> edit should only be one change
    act(() => {
      store.set(actionsAtom, [newAction1]);
      store.set(actionsAtom, [newAction1, newAction3]);
    });

    expect(screen.queryByText('1 edit')).toBeInTheDocument();

    // Multiple changes to the same entity should show the correct count
    act(() => {
      // Passing the previous entityId as a parameter to add this triple to the same entity
      const newTriple = MockNetworkData.makeStubTriple('Bob', 'Alice');

      store.set(actionsAtom, [newAction1, { ...newTriple, type: 'createTriple' }]);
    });

    expect(screen.queryByText('2 edits')).toBeInTheDocument();
    expect(screen.queryByText('1 entity in 1 space')).toBeInTheDocument();

    // Changes to multiple entities should show the correct count
    act(() => {
      // Passing the previous entityId as a parameter to add this triple to the same entity
      const newTriple1 = MockNetworkData.makeStubTriple('Bob', 'Charlie');
      const newTriple2 = MockNetworkData.makeStubTriple('Charlie');
      store.set(actionsAtom, [
        newAction1,
        { ...newTriple1, type: 'createTriple' },
        { ...newTriple2, type: 'createTriple' },
      ]);
    });

    expect(screen.queryByText('3 edits')).toBeInTheDocument();
    expect(screen.queryByText('2 entities in 1 space')).toBeInTheDocument();
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(actionsAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
          type: 'createTriple',
        },
      ]);
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(actionsAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
          type: 'createTriple',
        },
      ]);
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(actionsAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
          type: 'createTriple',
        },
      ]);
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(actionsAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
          type: 'createTriple',
        },
      ]);
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(actionsAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
          type: 'createTriple',
        },
      ]);
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
      <Providers
        onConnectionChange={async () => {
          //
        }}
      >
        <StatusBarContext.Provider value={{ state: initialState, dispatch: initialDispatch }}>
          <FlowBar />
        </StatusBarContext.Provider>
      </Providers>
    );

    act(() => {
      store.set(editableAtom, true);
      store.set(actionsAtom, [
        {
          ...MockNetworkData.makeStubTriple('Alice'),
          type: 'createTriple',
        },
      ]);
    });

    expect(screen.queryByText('An error has occurred')).toBeInTheDocument();
  });
});
