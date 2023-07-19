import type { NextRequest } from 'next/server';

export default async function handler(request: NextRequest) {
  /**
   * 1. Deploy a new space instance that points to the beacon address
   * 2. Configure the roles
   * 3. Add the Profile entry for the user with their name, wallet address, profile, etc.
   * 4. Add the Space entry for the user with the space name, contract address to the permissionless registry
   * 5. Create Space entity with configuration data
   * 6. Create Profile configuration entity with Geo "settings" and cached information for things like "hasSeenWelcome" etc.
   * 5. Give admin access to the user based on their wallet address
   * 6. Revoke ourselves as admin (we should still be the owner though)
   */
}
