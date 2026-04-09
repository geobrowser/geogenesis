'use client';

import cx from 'classnames';
import { atom, useAtomValue } from 'jotai';
import { RemoveScroll } from 'react-remove-scroll';

import { Spinner } from '~/design-system/spinner';

/** Shared with `use-reopen-rejected-proposal-edits` so the hook can toggle loading without touching global diff state. */
export const governanceReopenEditLoadingAtom = atom(false);

/**
 * Bottom strip for rejected-proposal reopen loading only.
 * Kept in ./governance so global FlowBar and diff-store stay free of this concern.
 */
export function GovernanceReopenEditLoadingBar() {
  const loading = useAtomValue(governanceReopenEditLoadingAtom);

  if (!loading) return null;

  return (
    <div
      className={cx(
        'pointer-events-none fixed inset-x-0 bottom-5 z-[10001] flex justify-center text-button',
        RemoveScroll.classNames.fullWidth
      )}
    >
      <div className="pointer-events-auto inline-flex h-10 items-center gap-2 overflow-hidden rounded-lg border border-divider bg-white px-4 shadow-lg">
        <Spinner />
        <span>Reopen edits…</span>
      </div>
    </div>
  );
}
