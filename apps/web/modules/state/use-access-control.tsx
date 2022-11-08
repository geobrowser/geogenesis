'use client';

// import { useAccount } from 'wagmi';
import { useSpaces } from './use-spaces';

export function useAccessControl(space: string) {
  // const { address } = useAccount();
  const { admins, editors } = useSpaces();

  return {
    isAdmin: false,
    isEditor: false,
  };

  // if (!address) {
  //   return {
  //     isAdmin: false,
  //     isEditor: false,
  //   };
  // }

  // return {
  //   isAdmin: (admins[space] || []).includes(address),
  //   isEditor: (editors[space] || []).includes(address),
  // };
}
