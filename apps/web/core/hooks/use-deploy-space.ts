import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { SpaceType } from '../types';
import { deploySpace } from '~/app/api/deploy';

interface DeployArgs {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string;
}

export function useDeploySpace() {
  const smartAccount = useSmartAccount();

  const deploy = async (args: DeployArgs) => {
    if (!smartAccount) {
      return;
    }

    // @TODO: Effectify
    return await deploySpace({
      ...args,
      initialEditorAddress: smartAccount?.account.address,
    });
  };

  return {
    deploy,
  };
}
