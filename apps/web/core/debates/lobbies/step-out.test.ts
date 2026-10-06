import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { debateEntryClick, registerLobbyStepOut, routeIntoDebate } from './step-out';

let clear: (() => void) | null = null;
afterEach(() => {
  clear?.();
  clear = null;
});

function click(overrides: Partial<{ button: number; metaKey: boolean; defaultPrevented: boolean }> = {}) {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.MouseEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe('routeIntoDebate', () => {
  it('navigates at once outside a lobby', () => {
    const go = vi.fn();
    routeIntoDebate(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('steps out first from a lobby', async () => {
    const order: string[] = [];
    clear = registerLobbyStepOut(async () => {
      order.push('step-out');
    });
    routeIntoDebate(() => order.push('go'));
    expect(order).toEqual(['step-out']);
    await vi.waitFor(() => expect(order).toEqual(['step-out', 'go']));
  });
});

describe('debateEntryClick', () => {
  it('leaves a link alone outside a lobby', () => {
    const navigate = vi.fn();
    const event = click();
    debateEntryClick(navigate)(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('steps out before a plain click navigates, but not a new-tab click', async () => {
    const stepOut = vi.fn(async () => undefined);
    clear = registerLobbyStepOut(stepOut);
    const navigate = vi.fn();

    const newTab = click({ metaKey: true });
    debateEntryClick(navigate)(newTab);
    expect(newTab.preventDefault).not.toHaveBeenCalled();

    const plain = click();
    debateEntryClick(navigate)(plain);
    expect(plain.preventDefault).toHaveBeenCalled();
    expect(stepOut).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  });
});

// A new way into a debate that skips the step-out drops the viewer off the lobby's roster.
describe('every debate entry steps out of a lobby', () => {
  const root = join(__dirname, '../../..');
  // Not a debater entering a debate: lobby-to-lobby links, watching one live, sign-in, debug.
  const allowed = new Set([
    'core/debates/lobbies/lobbies-card.tsx',
    'core/debates/lobbies/lobby-page.tsx',
    'core/debates/lobbies/open-lobby-dialog.tsx',
    'core/claims/browse/claim-end-slot.tsx',
    'app/debate/[roomId]/room-page-client.tsx',
    'app/space/[id]/(space)/debug-debate-rooms/debug-debate-rooms-page-client.tsx',
    // The debate room itself, prefetching or leaving for the picker afterwards.
    'app/space/[id]/(space)/debates/[debateId]/debate-room-page-client.tsx',
  ]);

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      if (name === 'node_modules' || name.startsWith('.')) return [];
      if (statSync(path).isDirectory()) return sources(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it('routes through routeIntoDebate or debateEntryClick', () => {
    const offenders = ['core', 'app', 'partials']
      .flatMap(dir => sources(join(root, dir)))
      .filter(path => {
        const source = readFileSync(path, 'utf8');
        const buildsDebatePath = /\b(debatePath|debateRematchPath|debateRoomPath)\(/.test(source);
        const navigates = /router\.(push|replace)\(|<Link\b/.test(source);
        const stepsOut = /\b(routeIntoDebate|debateEntryClick)\(/.test(source);
        return buildsDebatePath && navigates && !stepsOut;
      })
      .map(path => relative(root, path))
      .filter(path => !allowed.has(path));
    expect(offenders).toEqual([]);
  });
});
