import { fetchProfile } from './fetch-profile';

export async function fetchProfilesByAddresses(addresses: string[]) {
  const uniques = [...new Set(addresses).values()]
  return await Promise.all(uniques.map(address => fetchProfile({ address })));
}
