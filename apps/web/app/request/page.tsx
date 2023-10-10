'use client';

import { MembershipAbi } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { useContractWrite, usePrepareContractWrite } from 'wagmi';

export default function Test() {
  const { config, error } = usePrepareContractWrite({
    address: SYSTEM_IDS.MEMBERSHIP_CONTRACT_ADDRESS,
    abi: MembershipAbi,
    functionName: 'requestMembership',
    args: ['0xfD9E0873Ff5fAbd7B7398d4aa0E5267505DE20a6'],
  });
  const { write } = useContractWrite(config);

  const request = async () => {
    write?.();
  };

  return <button onClick={request}>Request membership in 0xfD9E0873Ff5fAbd7B7398d4aa0E5267505DE20a6</button>;
}
