'use client';

import { PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { encodeFunctionData } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { Button } from '~/design-system/button';

export function AddMember() {
  const smartAccount = useSmartAccount();
  const onClick = async () => {
    if (!smartAccount) {
      return;
    }

    await smartAccount.sendTransaction({
      to: '0xd0E078ca9674ed3e6e0b4A6A21ECfA9E9217769f',
      value: 0n,
      data: encodeFunctionData({
        abi: PersonalSpaceAdminAbi,
        functionName: 'submitNewMember',
        args: [smartAccount.account.address],
      }),
    });
  };

  return <Button onClick={onClick}>Add member</Button>;
}
