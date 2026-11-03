import { render } from '@testing-library/react';

import type * as React from 'react';

import { describe, expect, it } from 'vitest';

import {
  type RoomCapabilities,
  RoomCapabilitiesProvider,
  roomCapabilities,
  useRoomCapabilities,
} from './room-capabilities';

const CALL = { purpose: 'call' as const, spaceId: 'space1', exitHref: '/space/space1' };

describe('roomCapabilities', () => {
  it('gives a lobby debates and its next lobby, with no space or recording', () => {
    expect(roomCapabilities({ purpose: 'lobby' })).toEqual({
      noun: 'lobby',
      space: null,
      debates: true,
      nextLobby: true,
      recording: false,
      screenShare: true,
      chat: false,
    });
  });

  it('gives a call its space and recording, without debates or a next lobby', () => {
    expect(roomCapabilities(CALL)).toEqual({
      noun: 'call',
      space: { id: 'space1', exitHref: '/space/space1' },
      debates: false,
      nextLobby: false,
      recording: true,
      screenShare: true,
      chat: false,
    });
  });
});

describe('useRoomCapabilities', () => {
  function capture(children?: (read: React.ReactNode) => React.ReactNode) {
    const seen: RoomCapabilities[] = [];
    function Read() {
      seen.push(useRoomCapabilities());
      return null;
    }
    render(<>{children ? children(<Read />) : <Read />}</>);
    return seen;
  }

  it('reads a lobby outside any provider', () => {
    expect(capture()[0]).toEqual(roomCapabilities({ purpose: 'lobby' }));
  });

  it('reads the call under the call page’s provider', () => {
    const seen = capture(read => <RoomCapabilitiesProvider purpose={CALL}>{read}</RoomCapabilitiesProvider>);
    expect(seen[0]).toEqual(roomCapabilities(CALL));
  });
});
