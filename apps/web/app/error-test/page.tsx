'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { decodeErrorResult } from 'viem';

export default function ErrorTestPage() {
  return (
    <button
      onClick={() => {
        console.log(
          'error',
          decodeErrorResult({
            abi: MainVotingAbi,
            data: '0x70b4b254000000000000000000000000000000000000000000000000000000000000000000000000000000000000000011add79319b2ae65eb37f78e7949c88b9be660ce0000000000000000000000000000000000000000000000000000000000000002',
          })
        );
      }}
    >
      Error Test
    </button>
  );
}
