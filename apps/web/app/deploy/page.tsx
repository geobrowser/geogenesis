'use client';

import { useWalletClient } from 'wagmi';

import { deploySpaceContract } from '~/core/io/publish/contracts';

export default function Test() {
  const { data: wallet } = useWalletClient();

  const deploy = () => {
    if (wallet) {
      deploySpaceContract(wallet);
    }
  };

  return <button onClick={deploy}>Deploy Space contract</button>;
}
