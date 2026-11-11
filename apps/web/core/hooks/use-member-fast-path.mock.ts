import { vi } from 'vitest';

import type { MemberFastPathAction } from './use-member-fast-path';

/**
 * Shared test double for `useMemberFastPath`. Use with
 * `vi.mock('~/core/hooks/use-member-fast-path', () => import('~/core/hooks/use-member-fast-path.mock'))`
 * and call `resetMemberFastPathMock()` in `beforeEach`.
 */
export const memberFastPathMock = {
  status: 'idle' as 'idle' | 'pending' | 'success' | 'error',
  runs: {} as Partial<Record<MemberFastPathAction, ReturnType<typeof vi.fn>>>,
};

export function resetMemberFastPathMock() {
  memberFastPathMock.status = 'idle';
  memberFastPathMock.runs = {};
}

export function useMemberFastPath({ action }: { spaceId: string; action: MemberFastPathAction }) {
  memberFastPathMock.runs[action] ??= vi.fn();
  return { run: memberFastPathMock.runs[action]!, status: memberFastPathMock.status };
}
