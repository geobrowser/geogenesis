'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { Address } from '~/core/io/schema';
import { Space } from '~/core/io/dto/spaces';
import { getSpacesByAddresses } from '~/core/io/queries';

type UseSpacesByAddressesResult = {
  spaces: Space[];
  spacesByAddress: Map<string, Space>;
  isLoading: boolean;
};

type UseSpacesByAddressesData = Omit<UseSpacesByAddressesResult, 'isLoading'>;

export function useSpacesByAddresses(addresses: string[] = []): UseSpacesByAddressesResult {
  const requestedAddresses = [...new Set(addresses.filter(Boolean))];
  const normalizedAddresses = [...requestedAddresses].sort();

  const { data, isLoading } = useQuery({
    queryKey: ['spaces-by-addresses', normalizedAddresses],
    queryFn: ({ signal }) => Effect.runPromise(getSpacesByAddresses(normalizedAddresses, signal)),
    select: (fetchedSpaces): UseSpacesByAddressesData => {
      const spacesByAddress = new Map(fetchedSpaces.map(space => [space.address, space]));
      const spaces = requestedAddresses
        .map(address => spacesByAddress.get(Address(address)))
        .filter((space): space is Space => Boolean(space));

      return {
        spaces,
        spacesByAddress,
      };
    },
    enabled: normalizedAddresses.length > 0,
  });

  return {
    spaces: data?.spaces ?? [],
    spacesByAddress: data?.spacesByAddress ?? new Map(),
    isLoading,
  };
}
