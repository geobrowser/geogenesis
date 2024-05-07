'use client';

import { getAcceptSubspaceArguments } from '@geogenesis/sdk';

import { Services } from '~/core/services';

export function AddSubspaceButton() {
  return (
    <>
      <button
        className="flex w-full items-center bg-white px-3 py-2 text-grey-04 hover:bg-bg hover:text-text"
        onClick={undefined}
      >
        <p className="text-button">Add subspace</p>
      </button>
    </>
  );
}
